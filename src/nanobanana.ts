import { GoogleGenAI } from "@google/genai";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { z, type ZodRawShape } from "zod";

const MODEL_NAME = "gemini-2.5-flash-image-preview";
const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;

const aspectRatioSchema = z.enum(ASPECT_RATIOS);
const googleTokenSchema = z
  .string()
  .min(1, "googleToken is required")
  .describe("Google AI Studio API key/token used for this tool call.");

const generateImageInputSchema: ZodRawShape = {
  googleToken: googleTokenSchema,
  prompt: z
    .string()
    .min(1, "prompt is required")
    .describe("Detailed text description of the image to generate. Be specific about style, composition, lighting, colors, and mood."),
  outputPath: z.string().min(1, "outputPath is required").describe("Path to save the generated image file (PNG format)."),
  aspectRatio: aspectRatioSchema.optional().describe("Aspect ratio for the generated image (default: 1:1)."),
};

const editImageInputSchema: ZodRawShape = {
  googleToken: googleTokenSchema,
  inputPath: z.string().min(1, "inputPath is required").describe("Path to the input image file."),
  prompt: z
    .string()
    .min(1, "prompt is required")
    .describe("Detailed description of what to change, add, or remove from the image. Be specific about preserving unchanged elements."),
  outputPath: z.string().min(1, "outputPath is required").describe("Path to save the edited image file (PNG format)."),
  aspectRatio: aspectRatioSchema.optional().describe("Aspect ratio for the output image (default: matches input)."),
};

const compositeImagesInputSchema: ZodRawShape = {
  googleToken: googleTokenSchema,
  imagePaths: z.array(z.string().min(1)).min(1, "At least one input image is required").describe("Array of paths to input images (up to 3 images recommended)."),
  prompt: z
    .string()
    .min(1, "prompt is required")
    .describe("Detailed description of how to combine the images. Reference images by their order (first, second, third)."),
  outputPath: z.string().min(1, "outputPath is required").describe("Path to save the composite image file (PNG format)."),
  aspectRatio: aspectRatioSchema.optional().describe("Aspect ratio for the output image (default: 1:1)."),
};

const generateImageArgsSchema = z.object(generateImageInputSchema);
const editImageArgsSchema = z.object(editImageInputSchema);
const compositeImagesArgsSchema = z.object(compositeImagesInputSchema);

export const SERVER_INFO = {
  name: "nanobanana-mcp",
  version: "0.1.4",
};

interface InlineDataPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

interface GeminiTextPart {
  text: string;
}

type GeminiContent = string | Array<GeminiTextPart | GeminiInlineDataPart>;

type ToolCallback = (args: Record<string, unknown>) => Promise<CallToolResult>;

type RegisterTool = (name: string, config: { description: string; inputSchema: ZodRawShape }, callback: ToolCallback) => void;

function createGeminiClient(googleToken: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: googleToken });
}

function ensureDirectoryForFile(filePath: string): void {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function getImageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };

  return mimeTypes[extension] ?? "image/png";
}

function readImageAsInlineData(filePath: string): GeminiInlineDataPart {
  const imageData = fs.readFileSync(filePath);

  return {
    inlineData: {
      mimeType: getImageMimeType(filePath),
      data: imageData.toString("base64"),
    },
  };
}

async function generateImageBuffer(contents: GeminiContent, googleToken: string): Promise<Buffer> {
  const client = createGeminiClient(googleToken);
  const response = await client.models.generateContent({
    model: MODEL_NAME,
    contents,
  });

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("No content in response from Gemini API");
  }

  for (const part of parts) {
    const inlineData = (part as InlineDataPart).inlineData;
    if (inlineData) {
      return Buffer.from(inlineData.data, "base64");
    }
  }

  throw new Error("No image data returned from Gemini API");
}

function saveImage(filePath: string, imageBuffer: Buffer): void {
  ensureDirectoryForFile(filePath);
  fs.writeFileSync(filePath, imageBuffer);
}

function createTextResult(text: string): CallToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

export function registerNanobananaTools(server: McpServer): void {
  const registerTool = server.registerTool.bind(server) as unknown as RegisterTool;

  registerTool(
    "generate_image",
    {
      description: "Generate a new image from a text prompt using Google's Gemini 2.5 Flash Image model (nanobanana). Perfect for creating photorealistic scenes, illustrations, logos, product mockups, and more.",
      inputSchema: generateImageInputSchema,
    },
    async (args) => {
      const { googleToken, prompt, outputPath, aspectRatio } = generateImageArgsSchema.parse(args);
      const imageBuffer = await generateImageBuffer(prompt, googleToken);
      saveImage(outputPath, imageBuffer);

      return createTextResult(`Generated image saved to: ${outputPath}\nAspect ratio: ${aspectRatio ?? "1:1"}\nPrompt: ${prompt}`);
    }
  );

  registerTool(
    "edit_image",
    {
      description: "Edit an existing image using text prompts with Google's Gemini 2.5 Flash Image model. Add, remove, or modify elements while preserving the original style and composition.",
      inputSchema: editImageInputSchema,
    },
    async (args) => {
      const { googleToken, inputPath, prompt, outputPath, aspectRatio } = editImageArgsSchema.parse(args);
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      const imageBuffer = await generateImageBuffer([{ text: prompt }, readImageAsInlineData(inputPath)], googleToken);
      saveImage(outputPath, imageBuffer);

      return createTextResult(
        `Edited image saved to: ${outputPath}\nInput: ${inputPath}\nAspect ratio: ${aspectRatio ?? "matches input"}\nEdit: ${prompt}`
      );
    }
  );

  registerTool(
    "composite_images",
    {
      description: "Combine multiple images into a single composition using text prompts with Google's Gemini 2.5 Flash Image model. Perfect for product mockups, style transfer, and creative collages.",
      inputSchema: compositeImagesInputSchema,
    },
    async (args) => {
      const { googleToken, imagePaths, prompt, outputPath, aspectRatio } = compositeImagesArgsSchema.parse(args);
      for (const imagePath of imagePaths) {
        if (!fs.existsSync(imagePath)) {
          throw new Error(`Input file not found: ${imagePath}`);
        }
      }

      const imageParts = imagePaths.map((imagePath: string) => readImageAsInlineData(imagePath));
      const imageBuffer = await generateImageBuffer([{ text: prompt }, ...imageParts], googleToken);
      saveImage(outputPath, imageBuffer);

      return createTextResult(
        `Composite image saved to: ${outputPath}\nInput images: ${imagePaths.join(", ")}\nAspect ratio: ${aspectRatio ?? "1:1"}\nComposition: ${prompt}`
      );
    }
  );
}
