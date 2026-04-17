#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
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

const ASPECT_RATIO_ENUM = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"] as const;
type AspectRatio = typeof ASPECT_RATIO_ENUM[number];
// Types for tool arguments
interface GenerateImageArgs {
  prompt: string;
  outputPath: string;
  aspectRatio?: AspectRatio;
}

interface EditImageArgs {
  inputPath?: string;
  imageUrl?: string;
  prompt: string;
  outputPath: string;
  aspectRatio?: AspectRatio;
}

interface CompositeImagesArgs {
  imagePaths?: string[];
  imageUrls?: string[];
  prompt: string;
  outputPath: string;
  aspectRatio?: AspectRatio;
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

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "generate_image",
    description: "Generate a new image from a text prompt using Google's Gemini 2.5 Flash Image model (nanobanana). Perfect for creating photorealistic scenes, illustrations, logos, product mockups, and more.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed text description of the image to generate. Be specific about style, composition, lighting, colors, and mood.",
        },
        outputPath: {
          type: "string",
          description: "Path to save the generated image file (PNG format)",
        },
        aspectRatio: {
          type: "string",
          enum: ASPECT_RATIO_ENUM,
          description: "Aspect ratio for the generated image (default: 4:3)",
          default: "4:3",
        },
      },
      required: ["prompt", "outputPath"],
    },
  },
  {
    name: "edit_image",
    description: "Edit an existing image using text prompts with Google's Gemini 2.5 Flash Image model. Add, remove, or modify elements while preserving the original style and composition.",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to the input image file (required if imageUrl is not provided)",
        },
        imageUrl: {
          type: "string",
          description: "URL of the input image (data URL or real URL). Required if inputPath is not provided.",
        },
        prompt: {
          type: "string",
          description: "Detailed description of what to change, add, or remove from the image. Be specific about preserving unchanged elements.",
        },
        outputPath: {
          type: "string",
          description: "Path to save the edited image file (PNG format)",
        },
        aspectRatio: {
          type: "string",
          enum: ASPECT_RATIO_ENUM,
          description: "Aspect ratio for the output image (default: matches input)",
        },
      },
      required: ["prompt", "outputPath"],
    },
  },
  {
    name: "composite_images",
    description: "Combine multiple images into a single composition using text prompts with Google's Gemini 2.5 Flash Image model. Perfect for product mockups, style transfer, and creative collages.",
    inputSchema: {
      type: "object",
      properties: {
        imagePaths: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Array of paths to input images (up to 3 images recommended). Required if imageUrls is not provided.",
        },
        imageUrls: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Array of image URLs (data URLs or real URLs) to use as input (up to 3 images recommended). Required if imagePaths is not provided.",
        },
        prompt: {
          type: "string",
          description: "Detailed description of how to combine the images. Reference images by their order (first, second, third).",
        },
        outputPath: {
          type: "string",
          description: "Path to save the composite image file (PNG format)",
        },
        aspectRatio: {
          type: "string",
          enum: ASPECT_RATIO_ENUM,
          description: "Aspect ratio for the output image (default: 4:3)",
          default: "4:3",
        },
      },
      required: ["prompt", "outputPath"],
    },
  },
];

// Server implementation
class NanobananaImageMCPServer {
  private server: Server;
  private genai: GoogleGenAI | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "nanobanana-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private getGeminiClient(): GoogleGenAI {
    if (!this.genai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "GEMINI_API_KEY environment variable is required. " +
          "Get your API key from https://aistudio.google.com/app/apikey"
        );
      }
      this.genai = new GoogleGenAI({ apiKey });
    }
    return this.genai;
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "generate_image":
            return await this.generateImage(args as unknown as GenerateImageArgs);
          case "edit_image":
            return await this.editImage(args as unknown as EditImageArgs);
          case "composite_images":
            return await this.compositeImages(args as unknown as CompositeImagesArgs);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async generateImage(args: GenerateImageArgs) {
    const { prompt, outputPath, aspectRatio = "4:3" } = args;

    const genai = this.getGeminiClient();

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
      config: {
        imageConfig: {
          aspectRatio,
        },
      },
    });

    const response = result;

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API");
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error("No content in response from Gemini API");
    }

    // Extract image data from response
    let imageBuffer: Buffer | null = null;
    for (const part of candidate.content.parts) {
      const inlineDataPart = part as InlineDataPart;
      if (inlineDataPart.inlineData) {
        imageBuffer = Buffer.from(inlineDataPart.inlineData.data, "base64");
        break;
      }
    }

    if (!imageBuffer) {
      throw new Error("No image data returned from Gemini API");
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save the image
    fs.writeFileSync(outputPath, imageBuffer);

    return {
      content: [
        {
          type: "text",
          text: `Generated image saved to: ${outputPath}\nAspect ratio: ${aspectRatio}\nPrompt: ${prompt}`,
        },
      ],
    };
  }

  private async editImage(args: EditImageArgs) {
    const { inputPath, imageUrl, prompt, outputPath, aspectRatio } = args;

    let base64Image: string;
    let mimeType: string;

    if (imageUrl) {
      const loaded = await loadImageFromUrl(imageUrl);
      base64Image = loaded.base64;
      mimeType = loaded.mimeType;
    } else if (inputPath) {
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }
      const imageData = fs.readFileSync(inputPath);
      base64Image = imageData.toString("base64");
      const ext = path.extname(inputPath).toLowerCase();
      const mimeTypeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      };
      mimeType = mimeTypeMap[ext] || "image/png";
    } else {
      throw new Error("Either inputPath or imageUrl must be provided");
    }

    const genai = this.getGeminiClient();

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image,
          },
        },
      ],
      ...(aspectRatio && { config: { imageConfig: { aspectRatio } } }),
    });

    const response = result;

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API");
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error("No content in response from Gemini API");
    }

    // Extract image data from response
    let imageBuffer: Buffer | null = null;
    for (const part of candidate.content.parts) {
      const inlineDataPart = part as InlineDataPart;
      if (inlineDataPart.inlineData) {
        imageBuffer = Buffer.from(inlineDataPart.inlineData.data, "base64");
        break;
      }
    }

    if (!imageBuffer) {
      throw new Error("No image data returned from Gemini API");
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save the edited image
    fs.writeFileSync(outputPath, imageBuffer);

    const inputSource = imageUrl ?? inputPath;
    return {
      content: [
        {
          type: "text",
          text: `Edited image saved to: ${outputPath}\nInput: ${inputSource}\nEdit: ${prompt}`,
        },
      ],
    };
  }

  private async compositeImages(args: CompositeImagesArgs) {
    const { imagePaths = [], imageUrls = [], prompt, outputPath, aspectRatio = "4:3" } = args;

    if (imagePaths.length === 0 && imageUrls.length === 0) {
      throw new Error("Either imagePaths or imageUrls must be provided");
    }

    // Verify all input files exist
    for (const imagePath of imagePaths) {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Input file not found: ${imagePath}`);
      }
    }

    const totalImages = imagePaths.length + imageUrls.length;
    if (totalImages > 3) {
      console.error("Warning: More than 3 images provided. Model works best with up to 3 images.");
    }

    const genai = this.getGeminiClient();

    // Build content parts with all images
    const parts: any[] = [];

    // Add the text prompt first
    parts.push({ text: prompt });

    for (const imagePath of imagePaths) {
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const ext = path.extname(imagePath).toLowerCase();
      const mimeTypeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      };
      const mimeType = mimeTypeMap[ext] || "image/png";

      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Image,
        },
      });
    }

    for (const imageUrl of imageUrls) {
      const { base64, mimeType } = await loadImageFromUrl(imageUrl);
      parts.push({ inlineData: { mimeType, data: base64 } });
    }

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: parts,
      config: {
        imageConfig: {
          aspectRatio,
        },
      },
    });

    const response = result;

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API");
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error("No content in response from Gemini API");
    }

    // Extract image data from response
    let imageBuffer: Buffer | null = null;
    for (const part of candidate.content.parts) {
      const inlineDataPart = part as InlineDataPart;
      if (inlineDataPart.inlineData) {
        imageBuffer = Buffer.from(inlineDataPart.inlineData.data, "base64");
        break;
      }
    }

    if (!imageBuffer) {
      throw new Error("No image data returned from Gemini API");
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save the composite image
    fs.writeFileSync(outputPath, imageBuffer);

    const allInputs = [...imagePaths, ...imageUrls];
    return {
      content: [
        {
          type: "text",
          text: `Composite image saved to: ${outputPath}\nInput images: ${allInputs.join(", ")}\nComposition: ${prompt}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Nanobanana MCP Server running on stdio");
    console.error("Using Google Gemini 2.5 Flash Image model (nanobanana)");
  }
}

// Start the server
const server = new NanobananaImageMCPServer();
server.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

