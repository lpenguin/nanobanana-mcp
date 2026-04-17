import { AsyncLocalStorage } from "async_hooks";
import { z } from "zod";
import { createMcpHandler } from "mcp-handler";
import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";

// Helper type for extracting inline data from Gemini responses
interface InlineDataPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

const googleApiKeyStorage = new AsyncLocalStorage<string | null>();

function getGeminiClient(): GoogleGenAI {
  const apiKey = googleApiKeyStorage.getStore();
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY header is required. Pass your Google Gemini API key via the GOOGLE_API_KEY HTTP header."
    );
  }
  return new GoogleGenAI({ apiKey });
}

async function loadImageFromUrl(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error(`Invalid data URL format`);
    }
    return { mimeType: match[1], base64: match[2] };
  }
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${imageUrl} (${response.status} ${response.statusText})`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const mimeType = contentType.split(";")[0].trim();
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { base64, mimeType };
}

async function extractImageBuffer(
  candidates: NonNullable<Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>["candidates"]>
): Promise<Buffer> {
  if (candidates.length === 0) {
    throw new Error("No candidates returned from Gemini API");
  }
  const candidate = candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    throw new Error("No content in response from Gemini API");
  }
  for (const part of candidate.content.parts) {
    const inlineDataPart = part as InlineDataPart;
    if (inlineDataPart.inlineData) {
      return Buffer.from(inlineDataPart.inlineData.data, "base64");
    }
  }
  throw new Error("No image data returned from Gemini API");
}

async function uploadImageToBlob(buffer: Buffer, filename: string): Promise<string> {
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: "image/png",
  });
  return blob.url;
}

function generateFilename(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}.png`;
}

const ASPECT_RATIO_ENUM = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"] as const;

const aspectRatioSchema = z
  .enum(ASPECT_RATIO_ENUM)
  .default("4:3")
  .describe(`Aspect ratio for the generated image (default: 4:3). Allowed values: ${ASPECT_RATIO_ENUM.join(", ")}`);

const ALLOWED_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
] as const;

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";

const modelSchema = z
  .enum(ALLOWED_MODELS)
  .default(DEFAULT_MODEL)
  .describe(
    `Gemini model to use for image generation. Allowed values: ${ALLOWED_MODELS.join(", ")}. Default: ${DEFAULT_MODEL}`
  );

const baseHandler = createMcpHandler(
  (server) => {
    server.tool(
      "generate_image",
      "Generate a new image from a text prompt using Google's Gemini image model (nanobanana). The image is uploaded to Vercel Blob and the URL is returned.",
      {
        prompt: z
          .string()
          .describe(
            "Detailed text description of the image to generate. Be specific about style, composition, lighting, colors, and mood."
          ),
        model: modelSchema,
        aspectRatio: aspectRatioSchema,
      },
      async ({ prompt, model, aspectRatio }) => {
        const genai = getGeminiClient();
        const result = await genai.models.generateContent({
          model,
          contents: prompt,
          config: {
            imageConfig: {
              aspectRatio,
            },
          },
        });

        if (!result.candidates) {
          throw new Error("No candidates returned from Gemini API");
        }
        const imageBuffer = await extractImageBuffer(result.candidates);
        const url = await uploadImageToBlob(imageBuffer, generateFilename("generated"));

        return {
          content: [
            {
              type: "text" as const,
              text: url,
            },
          ],
        };
      }
    );

    server.tool(
      "edit_image",
      "Edit an existing image using text prompts with Google's Gemini image model. The edited image is uploaded to Vercel Blob and the URL is returned.",
      {
        imageUrl: z.string().describe("URL of the input image (data URL or real URL)."),
        prompt: z
          .string()
          .describe(
            "Detailed description of what to change, add, or remove from the image. Be specific about preserving unchanged elements."
          ),
        model: modelSchema,
      },
      async ({ imageUrl, prompt, model }) => {
        const { base64: base64Image, mimeType } = await loadImageFromUrl(imageUrl);

        const genai = getGeminiClient();
        const result = await genai.models.generateContent({
          model,
          contents: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Image } },
          ],
        });

        if (!result.candidates) {
          throw new Error("No candidates returned from Gemini API");
        }
        const imageBuffer = await extractImageBuffer(result.candidates);
        const url = await uploadImageToBlob(imageBuffer, generateFilename("edited"));

        return {
          content: [
            {
              type: "text" as const,
              text: url,
            },
          ],
        };
      }
    );

    server.tool(
      "composite_images",
      "Combine multiple images into a single composition using text prompts with Google's Gemini image model. The composite image is uploaded to Vercel Blob and the URL is returned.",
      {
        imageUrls: z
          .array(z.string())
          .describe("Array of image URLs (data URLs or real URLs) to use as input (up to 3 images recommended)."),
        prompt: z
          .string()
          .describe(
            "Detailed description of how to combine the images. Reference images by their order (first, second, third)."
          ),
        model: modelSchema,
        aspectRatio: aspectRatioSchema,
      },
      async ({ imageUrls, prompt, model, aspectRatio }) => {
        if (imageUrls.length === 0) {
          throw new Error("imageUrls must contain at least one URL");
        }

        if (imageUrls.length > 3) {
          console.warn(
            "Warning: More than 3 images provided. Model works best with up to 3 images."
          );
        }

        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];

        for (const imageUrl of imageUrls) {
          const { base64, mimeType } = await loadImageFromUrl(imageUrl);
          parts.push({ inlineData: { mimeType, data: base64 } });
        }

        const genai = getGeminiClient();
        const result = await genai.models.generateContent({
          model,
          contents: parts,
          config: {
            imageConfig: {
              aspectRatio,
            },
          },
        });

        if (!result.candidates) {
          throw new Error("No candidates returned from Gemini API");
        }
        const imageBuffer = await extractImageBuffer(result.candidates);
        const url = await uploadImageToBlob(imageBuffer, generateFilename("composite"));

        return {
          content: [
            {
              type: "text" as const,
              text: url,
            },
          ],
        };
      }
    );
  },
  {
    serverInfo: {
      name: "nanobanana-mcp",
      version: "0.1.4",
    },
  },
  { basePath: "" }
);

function withGoogleApiKey(handler: (req: Request) => Promise<Response>) {
  return (req: Request): Promise<Response> => {
    const apiKey = req.headers.get("GOOGLE_API_KEY");
    if (req.method === "POST" && !apiKey) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32600,
              message:
                "GOOGLE_API_KEY header is required. Pass your Google Gemini API key via the GOOGLE_API_KEY HTTP header.",
            },
            id: null,
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      );
    }
    return googleApiKeyStorage.run(apiKey, () => handler(req));
  };
}

const GET = withGoogleApiKey(baseHandler);
const POST = withGoogleApiKey(baseHandler);
const DELETE = withGoogleApiKey(baseHandler);

export { GET, POST, DELETE };
