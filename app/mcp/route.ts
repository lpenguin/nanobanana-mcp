import { z } from "zod";
import { createMcpHandler } from "mcp-handler";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

// Helper type for extracting inline data from Gemini responses
interface InlineDataPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

const ASPECT_RATIO_VALUES = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

const aspectRatioSchema = z
  .enum(ASPECT_RATIO_VALUES)
  .optional()
  .default("1:1")
  .describe("Aspect ratio for the generated image (default: 1:1)");

const MIME_TYPE_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
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

function saveImage(outputPath: string, buffer: Buffer): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, buffer);
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "generate_image",
      "Generate a new image from a text prompt using Google's Gemini 2.5 Flash Image model (nanobanana). Perfect for creating photorealistic scenes, illustrations, logos, product mockups, and more.",
      {
        googleApiKey: z
          .string()
          .describe("Google Gemini API key. Get one at https://aistudio.google.com/app/apikey"),
        prompt: z
          .string()
          .describe(
            "Detailed text description of the image to generate. Be specific about style, composition, lighting, colors, and mood."
          ),
        outputPath: z
          .string()
          .describe("Path to save the generated image file (PNG format)"),
        aspectRatio: aspectRatioSchema,
      },
      async ({ googleApiKey, prompt, outputPath, aspectRatio = "1:1" }) => {
        const genai = getGeminiClient(googleApiKey);
        const result = await genai.models.generateContent({
          model: "gemini-2.5-flash-image-preview",
          contents: prompt,
        });

        if (!result.candidates) {
          throw new Error("No candidates returned from Gemini API");
        }
        const imageBuffer = await extractImageBuffer(result.candidates);
        saveImage(outputPath, imageBuffer);

        return {
          content: [
            {
              type: "text" as const,
              text: `Generated image saved to: ${outputPath}\nAspect ratio: ${aspectRatio}\nPrompt: ${prompt}`,
            },
          ],
        };
      }
    );

    server.tool(
      "edit_image",
      "Edit an existing image using text prompts with Google's Gemini 2.5 Flash Image model. Add, remove, or modify elements while preserving the original style and composition.",
      {
        googleApiKey: z
          .string()
          .describe("Google Gemini API key. Get one at https://aistudio.google.com/app/apikey"),
        inputPath: z.string().describe("Path to the input image file"),
        prompt: z
          .string()
          .describe(
            "Detailed description of what to change, add, or remove from the image. Be specific about preserving unchanged elements."
          ),
        outputPath: z
          .string()
          .describe("Path to save the edited image file (PNG format)"),
        aspectRatio: z
          .enum(ASPECT_RATIO_VALUES)
          .optional()
          .describe("Aspect ratio for the output image (default: matches input)"),
      },
      async ({ googleApiKey, inputPath, prompt, outputPath }) => {
        if (!fs.existsSync(inputPath)) {
          throw new Error(`Input file not found: ${inputPath}`);
        }

        const imageData = fs.readFileSync(inputPath);
        const base64Image = imageData.toString("base64");
        const ext = path.extname(inputPath).toLowerCase();
        const mimeType = MIME_TYPE_MAP[ext] || "image/png";

        const genai = getGeminiClient(googleApiKey);
        const result = await genai.models.generateContent({
          model: "gemini-2.5-flash-image-preview",
          contents: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Image } },
          ],
        });

        if (!result.candidates) {
          throw new Error("No candidates returned from Gemini API");
        }
        const imageBuffer = await extractImageBuffer(result.candidates);
        saveImage(outputPath, imageBuffer);

        return {
          content: [
            {
              type: "text" as const,
              text: `Edited image saved to: ${outputPath}\nInput: ${inputPath}\nEdit: ${prompt}`,
            },
          ],
        };
      }
    );

    server.tool(
      "composite_images",
      "Combine multiple images into a single composition using text prompts with Google's Gemini 2.5 Flash Image model. Perfect for product mockups, style transfer, and creative collages.",
      {
        googleApiKey: z
          .string()
          .describe("Google Gemini API key. Get one at https://aistudio.google.com/app/apikey"),
        imagePaths: z
          .array(z.string())
          .describe("Array of paths to input images (up to 3 images recommended)"),
        prompt: z
          .string()
          .describe(
            "Detailed description of how to combine the images. Reference images by their order (first, second, third)."
          ),
        outputPath: z
          .string()
          .describe("Path to save the composite image file (PNG format)"),
        aspectRatio: aspectRatioSchema,
      },
      async ({ googleApiKey, imagePaths, prompt, outputPath, aspectRatio = "1:1" }) => {
        for (const imagePath of imagePaths) {
          if (!fs.existsSync(imagePath)) {
            throw new Error(`Input file not found: ${imagePath}`);
          }
        }

        if (imagePaths.length > 3) {
          console.warn(
            "Warning: More than 3 images provided. Model works best with up to 3 images."
          );
        }

        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];

        for (const imagePath of imagePaths) {
          const imageData = fs.readFileSync(imagePath);
          const base64Image = imageData.toString("base64");
          const ext = path.extname(imagePath).toLowerCase();
          const mimeType = MIME_TYPE_MAP[ext] || "image/png";
          parts.push({ inlineData: { mimeType, data: base64Image } });
        }

        const genai = getGeminiClient(googleApiKey);
        const result = await genai.models.generateContent({
          model: "gemini-2.5-flash-image-preview",
          contents: parts,
        });

        if (!result.candidates) {
          throw new Error("No candidates returned from Gemini API");
        }
        const imageBuffer = await extractImageBuffer(result.candidates);
        saveImage(outputPath, imageBuffer);

        return {
          content: [
            {
              type: "text" as const,
              text: `Composite image saved to: ${outputPath}\nInput images: ${imagePaths.join(", ")}\nComposition: ${prompt}\nAspect ratio: ${aspectRatio}`,
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

export { handler as GET, handler as POST, handler as DELETE };
