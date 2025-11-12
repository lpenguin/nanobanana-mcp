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

// Types for tool arguments
interface GenerateImageArgs {
  prompt: string;
  outputPath: string;
  aspectRatio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
}

interface EditImageArgs {
  inputPath: string;
  prompt: string;
  outputPath: string;
  aspectRatio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
}

interface CompositeImagesArgs {
  imagePaths: string[];
  prompt: string;
  outputPath: string;
  aspectRatio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
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
          enum: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
          description: "Aspect ratio for the generated image (default: 1:1)",
          default: "1:1",
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
          description: "Path to the input image file",
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
          enum: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
          description: "Aspect ratio for the output image (default: matches input)",
        },
      },
      required: ["inputPath", "prompt", "outputPath"],
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
          description: "Array of paths to input images (up to 3 images recommended)",
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
          enum: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
          description: "Aspect ratio for the output image (default: 1:1)",
          default: "1:1",
        },
      },
      required: ["imagePaths", "prompt", "outputPath"],
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
    const { prompt, outputPath, aspectRatio = "1:1" } = args;

    const genai = this.getGeminiClient();

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
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
    const { inputPath, prompt, outputPath } = args;

    // Verify input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Read input image
    const imageData = fs.readFileSync(inputPath);
    const base64Image = imageData.toString("base64");

    const genai = this.getGeminiClient();

    // Determine MIME type from file extension
    const ext = path.extname(inputPath).toLowerCase();
    const mimeTypeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    const mimeType = mimeTypeMap[ext] || "image/png";

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

    return {
      content: [
        {
          type: "text",
          text: `Edited image saved to: ${outputPath}\nInput: ${inputPath}\nEdit: ${prompt}`,
        },
      ],
    };
  }

  private async compositeImages(args: CompositeImagesArgs) {
    const { imagePaths, prompt, outputPath } = args;

    // Verify all input files exist
    for (const imagePath of imagePaths) {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Input file not found: ${imagePath}`);
      }
    }

    if (imagePaths.length > 3) {
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

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: parts,
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

    return {
      content: [
        {
          type: "text",
          text: `Composite image saved to: ${outputPath}\nInput images: ${imagePaths.join(", ")}\nComposition: ${prompt}`,
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

