#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { createCanvas, loadImage, Canvas } from "canvas";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

// Types for tool arguments
interface CreateImageArgs {
  width: number;
  height: number;
  backgroundColor?: string;
  format?: "png" | "jpeg" | "webp";
  outputPath: string;
}

interface DrawTextArgs {
  inputPath?: string;
  outputPath: string;
  text: string;
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  width?: number;
  height?: number;
}

interface DrawRectangleArgs {
  inputPath: string;
  outputPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  strokeColor?: string;
  lineWidth?: number;
}

interface ResizeImageArgs {
  inputPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
}

interface ApplyFilterArgs {
  inputPath: string;
  outputPath: string;
  filter: "grayscale" | "blur" | "sharpen" | "negate" | "rotate";
  options?: {
    sigma?: number;
    angle?: number;
  };
}

interface CompositeImagesArgs {
  backgroundPath: string;
  overlayPath: string;
  outputPath: string;
  x?: number;
  y?: number;
}

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "create_image",
    description: "Create a new image with specified dimensions and background color",
    inputSchema: {
      type: "object",
      properties: {
        width: {
          type: "number",
          description: "Width of the image in pixels",
        },
        height: {
          type: "number",
          description: "Height of the image in pixels",
        },
        backgroundColor: {
          type: "string",
          description: "Background color (e.g., '#ffffff', 'white', 'rgb(255,255,255)')",
          default: "white",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg", "webp"],
          description: "Output format",
          default: "png",
        },
        outputPath: {
          type: "string",
          description: "Path to save the image file",
        },
      },
      required: ["width", "height", "outputPath"],
    },
  },
  {
    name: "draw_text",
    description: "Draw text on an existing image or create a new image with text",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to input image (optional, creates new if not provided)",
        },
        outputPath: {
          type: "string",
          description: "Path to save the output image",
        },
        text: {
          type: "string",
          description: "Text to draw",
        },
        x: {
          type: "number",
          description: "X coordinate",
          default: 10,
        },
        y: {
          type: "number",
          description: "Y coordinate",
          default: 30,
        },
        fontSize: {
          type: "number",
          description: "Font size in pixels",
          default: 20,
        },
        fontFamily: {
          type: "string",
          description: "Font family",
          default: "Arial",
        },
        color: {
          type: "string",
          description: "Text color",
          default: "black",
        },
        width: {
          type: "number",
          description: "Width for new image (if no input)",
          default: 800,
        },
        height: {
          type: "number",
          description: "Height for new image (if no input)",
          default: 600,
        },
      },
      required: ["text", "outputPath"],
    },
  },
  {
    name: "draw_rectangle",
    description: "Draw a rectangle on an image",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to input image",
        },
        outputPath: {
          type: "string",
          description: "Path to save the output image",
        },
        x: {
          type: "number",
          description: "X coordinate of top-left corner",
        },
        y: {
          type: "number",
          description: "Y coordinate of top-left corner",
        },
        width: {
          type: "number",
          description: "Width of rectangle",
        },
        height: {
          type: "number",
          description: "Height of rectangle",
        },
        fillColor: {
          type: "string",
          description: "Fill color (optional)",
        },
        strokeColor: {
          type: "string",
          description: "Stroke color",
          default: "black",
        },
        lineWidth: {
          type: "number",
          description: "Line width",
          default: 2,
        },
      },
      required: ["inputPath", "outputPath", "x", "y", "width", "height"],
    },
  },
  {
    name: "resize_image",
    description: "Resize an image to specified dimensions",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to input image",
        },
        outputPath: {
          type: "string",
          description: "Path to save the resized image",
        },
        width: {
          type: "number",
          description: "Target width in pixels",
        },
        height: {
          type: "number",
          description: "Target height in pixels",
        },
        fit: {
          type: "string",
          enum: ["cover", "contain", "fill", "inside", "outside"],
          description: "How the image should be resized",
          default: "cover",
        },
      },
      required: ["inputPath", "outputPath"],
    },
  },
  {
    name: "apply_filter",
    description: "Apply a filter or effect to an image",
    inputSchema: {
      type: "object",
      properties: {
        inputPath: {
          type: "string",
          description: "Path to input image",
        },
        outputPath: {
          type: "string",
          description: "Path to save the filtered image",
        },
        filter: {
          type: "string",
          enum: ["grayscale", "blur", "sharpen", "negate", "rotate"],
          description: "Filter to apply",
        },
        options: {
          type: "object",
          description: "Filter-specific options (e.g., {sigma: 5} for blur, {angle: 90} for rotate)",
        },
      },
      required: ["inputPath", "outputPath", "filter"],
    },
  },
  {
    name: "composite_images",
    description: "Overlay one image on top of another",
    inputSchema: {
      type: "object",
      properties: {
        backgroundPath: {
          type: "string",
          description: "Path to background image",
        },
        overlayPath: {
          type: "string",
          description: "Path to overlay image",
        },
        outputPath: {
          type: "string",
          description: "Path to save the composite image",
        },
        x: {
          type: "number",
          description: "X position of overlay",
          default: 0,
        },
        y: {
          type: "number",
          description: "Y position of overlay",
          default: 0,
        },
      },
      required: ["backgroundPath", "overlayPath", "outputPath"],
    },
  },
];

// Server implementation
class ImageMCPServer {
  private server: Server;

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
          case "create_image":
            return await this.createImage(args as unknown as CreateImageArgs);
          case "draw_text":
            return await this.drawText(args as unknown as DrawTextArgs);
          case "draw_rectangle":
            return await this.drawRectangle(args as unknown as DrawRectangleArgs);
          case "resize_image":
            return await this.resizeImage(args as unknown as ResizeImageArgs);
          case "apply_filter":
            return await this.applyFilter(args as unknown as ApplyFilterArgs);
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

  private async createImage(args: CreateImageArgs) {
    const {
      width,
      height,
      backgroundColor = "white",
      format = "png",
      outputPath,
    } = args;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const buffer = format === "png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg");
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);

    return {
      content: [
        {
          type: "text",
          text: `Created image: ${width}x${height} at ${outputPath}`,
        },
      ],
    };
  }

  private async drawText(args: DrawTextArgs) {
    const {
      inputPath,
      outputPath,
      text,
      x = 10,
      y = 30,
      fontSize = 20,
      fontFamily = "Arial",
      color = "black",
      width = 800,
      height = 600,
    } = args;

    let canvas: Canvas;

    if (inputPath && fs.existsSync(inputPath)) {
      // Load existing image
      const img = await sharp(inputPath).toBuffer();
      const metadata = await sharp(inputPath).metadata();
      canvas = createCanvas(metadata.width || width, metadata.height || height);
      const ctx = canvas.getContext("2d");
      
      // Draw the loaded image
      const canvasImg = await loadImage(img);
      ctx.drawImage(canvasImg, 0, 0);
    } else {
      // Create new canvas
      canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
    }

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillText(text, x, y);

    const buffer = canvas.toBuffer("image/png");
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);

    return {
      content: [
        {
          type: "text",
          text: `Drew text on image: ${outputPath}`,
        },
      ],
    };
  }

  private async drawRectangle(args: DrawRectangleArgs) {
    const {
      inputPath,
      outputPath,
      x,
      y,
      width,
      height,
      fillColor,
      strokeColor = "black",
      lineWidth = 2,
    } = args;

    const img = await sharp(inputPath).toBuffer();
    const metadata = await sharp(inputPath).metadata();
    const canvas = createCanvas(metadata.width!, metadata.height!);
    const ctx = canvas.getContext("2d");

    // Draw the loaded image
    const canvasImg = await loadImage(img);
    ctx.drawImage(canvasImg, 0, 0);

    // Draw rectangle
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, width, height);
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y, width, height);

    const buffer = canvas.toBuffer("image/png");
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);

    return {
      content: [
        {
          type: "text",
          text: `Drew rectangle on image: ${outputPath}`,
        },
      ],
    };
  }

  private async resizeImage(args: ResizeImageArgs) {
    const { inputPath, outputPath, width, height, fit = "cover" } = args;

    let transformer = sharp(inputPath);

    if (width || height) {
      transformer = transformer.resize(width, height, { fit });
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await transformer.toFile(outputPath);

    return {
      content: [
        {
          type: "text",
          text: `Resized image to ${width || "auto"}x${height || "auto"}: ${outputPath}`,
        },
      ],
    };
  }

  private async applyFilter(args: ApplyFilterArgs) {
    const { inputPath, outputPath, filter, options = {} } = args;

    let transformer = sharp(inputPath);

    switch (filter) {
      case "grayscale":
        transformer = transformer.grayscale();
        break;
      case "blur":
        transformer = transformer.blur(options.sigma || 5);
        break;
      case "sharpen":
        transformer = transformer.sharpen();
        break;
      case "negate":
        transformer = transformer.negate();
        break;
      case "rotate":
        transformer = transformer.rotate(options.angle || 90);
        break;
      default:
        throw new Error(`Unknown filter: ${filter}`);
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await transformer.toFile(outputPath);

    return {
      content: [
        {
          type: "text",
          text: `Applied ${filter} filter: ${outputPath}`,
        },
      ],
    };
  }

  private async compositeImages(args: CompositeImagesArgs) {
    const { backgroundPath, overlayPath, outputPath, x = 0, y = 0 } = args;

    const overlay = await sharp(overlayPath).toBuffer();

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await sharp(backgroundPath)
      .composite([
        {
          input: overlay,
          top: y,
          left: x,
        },
      ])
      .toFile(outputPath);

    return {
      content: [
        {
          type: "text",
          text: `Composited images: ${outputPath}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Nanobanana MCP Server running on stdio");
  }
}

// Start the server
const server = new ImageMCPServer();
server.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
