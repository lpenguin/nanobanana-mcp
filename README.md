# nanobanana-mcp

A Model Context Protocol (MCP) server for creating and editing images using Google's Gemini 2.5 Flash Image model (nicknamed "nanobanana"). Built with TypeScript, this server provides powerful AI-driven image generation and manipulation capabilities through a simple MCP interface.

## Features

- **Text-to-Image Generation**: Create high-quality images from detailed text descriptions
- **Image Editing**: Modify existing images using natural language prompts
- **Multi-Image Composition**: Combine multiple images into creative compositions
- **Flexible Aspect Ratios**: Support for various aspect ratios (1:1, 16:9, 9:16, and more)
- **Powered by Google Gemini**: Uses the state-of-the-art Gemini 2.5 Flash Image model

## Prerequisites

- Node.js >= 18.0.0
- A Google Gemini API key (get one from [Google AI Studio](https://aistudio.google.com/app/apikey))

## Installation

```bash
npm install -g @lpenguin/nanobanana-mcp
```

Or install locally in your project:

```bash
npm install @lpenguin/nanobanana-mcp
```

## Configuration

Set your Google Gemini API key as an environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

## Usage

### As an MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "npx",
      "args": ["@lpenguin/nanobanana-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "nanobanana-mcp",
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Available Tools

#### generate_image

Generate a new image from a text prompt using Google's Gemini 2.5 Flash Image model.

**Parameters:**
- `prompt` (string, required): Detailed text description of the image to generate. Be specific about style, composition, lighting, colors, and mood.
- `outputPath` (string, required): Path to save the generated image (PNG format)
- `aspectRatio` (string, optional): Aspect ratio for the image - "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9" (default: "1:1")

**Example:**
```javascript
{
  "prompt": "A photorealistic close-up portrait of an elderly Japanese ceramicist with deep, sun-etched wrinkles and a warm, knowing smile. He is carefully inspecting a freshly glazed tea bowl. The setting is his rustic, sun-drenched workshop. The scene is illuminated by soft, golden hour light streaming through a window.",
  "outputPath": "./images/ceramicist.png",
  "aspectRatio": "4:3"
}
```

#### edit_image

Edit an existing image using text prompts. Add, remove, or modify elements while preserving the original style and composition.

**Parameters:**
- `inputPath` (string, required): Path to the input image file
- `prompt` (string, required): Detailed description of what to change, add, or remove. Be specific about preserving unchanged elements.
- `outputPath` (string, required): Path to save the edited image (PNG format)
- `aspectRatio` (string, optional): Aspect ratio for the output image (default: matches input)

**Example:**
```javascript
{
  "inputPath": "./images/cat.png",
  "prompt": "Add a small, knitted wizard hat on the cat's head. Make it look like it's sitting comfortably and matches the soft lighting of the photo.",
  "outputPath": "./images/cat_with_hat.png"
}
```

#### composite_images

Combine multiple images into a single composition using text prompts. Perfect for product mockups, style transfer, and creative collages.

**Parameters:**
- `imagePaths` (array of strings, required): Array of paths to input images (up to 3 images recommended)
- `prompt` (string, required): Detailed description of how to combine the images. Reference images by their order (first, second, third).
- `outputPath` (string, required): Path to save the composite image (PNG format)
- `aspectRatio` (string, optional): Aspect ratio for the output image (default: "1:1")

**Example:**
```javascript
{
  "imagePaths": ["./images/dress.png", "./images/model.png"],
  "prompt": "Create a professional e-commerce fashion photo. Take the blue floral dress from the first image and let the woman from the second image wear it. Generate a realistic, full-body shot.",
  "outputPath": "./images/fashion_shot.png",
  "aspectRatio": "2:3"
}
```

## Prompting Tips

For best results when generating or editing images:

1. **Be Descriptive**: Use detailed, narrative descriptions rather than keyword lists
2. **Specify Style**: Mention artistic style, photography terms, lighting, and mood
3. **Use Photography Terms**: For realistic images, mention camera angles, lens types, and lighting
4. **Preserve Details**: When editing, explicitly state what should remain unchanged
5. **Reference Order**: When compositing, refer to images as "first", "second", "third"

### Example Prompts

**Photorealistic:**
```
A photorealistic close-up portrait of an elderly Japanese ceramicist with deep, 
sun-etched wrinkles and a warm, knowing smile. Captured with an 85mm portrait lens.
```

**Stylized:**
```
A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. Bold, clean 
outlines, simple cel-shading, vibrant color palette. White background.
```

**Logo/Text:**
```
Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'. 
Clean, bold, sans-serif font. Simple coffee bean icon. Black and white.
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/lpenguin/nanobanana-mcp.git
cd nanobanana-mcp

# Install dependencies
npm install

# Build
npm run build

# Run integration tests (requires GEMINI_API_KEY)
npm test

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Watch mode for development
npm run watch
```

### Testing

The project includes integration tests that verify the MCP server works correctly:

```bash
# Set your API key
export GEMINI_API_KEY="your-api-key-here"

# Run the integration test
npm test
```

The integration test:
- Verifies the server can start successfully
- Tests MCP protocol communication
- Lists all available tools
- Does not execute actual image operations (no API calls)

A GitHub Actions workflow also runs these tests on every push and pull request.

### Project Structure

```
nanobanana-mcp/
├── src/
│   └── index.ts              # Main server implementation
├── dist/                     # Compiled output (generated)
├── .github/
│   └── workflows/
│       ├── publish.yml       # CI/CD workflow
│       └── integration-test.yml  # Integration test workflow
├── package.json              # Package configuration
├── tsconfig.json             # TypeScript configuration
├── .eslintrc.json            # ESLint configuration
├── .gitignore                # Git ignore rules
├── test-integration.js       # Integration test script
└── README.md                 # This file
```

## About Gemini 2.5 Flash Image (Nanobanana)

This MCP server uses Google's Gemini 2.5 Flash Image model, nicknamed "nanobanana" by the developer community. Key features:

- **Text-to-Image**: Generate images from descriptions
- **Image Editing**: Add, remove, or modify elements conversationally
- **Multi-Image Composition**: Combine multiple images
- **Iterative Refinement**: Make progressive adjustments
- **High-Fidelity Text**: Accurate text rendering in images
- **SynthID Watermark**: All generated images include a watermark

## Aspect Ratios

Supported aspect ratios and their resolutions:

| Aspect Ratio | Resolution | Use Case |
|--------------|------------|----------|
| 1:1 | 1024x1024 | Square images, social media |
| 2:3 | 832x1248 | Portrait photography |
| 3:2 | 1248x832 | Landscape photography |
| 3:4 | 864x1184 | Portrait mode |
| 4:3 | 1184x864 | Standard display |
| 4:5 | 896x1152 | Instagram portrait |
| 5:4 | 1152x896 | Medium format |
| 9:16 | 768x1344 | Vertical video, stories |
| 16:9 | 1344x768 | Widescreen, presentations |
| 21:9 | 1536x672 | Ultra-wide, cinematic |

## Publishing

The package is automatically published to npm when a new version tag is pushed:

```bash
# Update version in package.json, then:
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions workflows will:
1. Run linting
2. Build the project
3. Run integration tests
4. Publish to npm (if pushing a version tag)

## API Costs

Image generation with Gemini 2.5 Flash Image is token-based:
- $30 per 1 million tokens for image output
- Each image output is tokenized at 1290 tokens (flat rate, up to 1024x1024px)
- Approximately $0.039 per image

## Limitations

- Best performance with English, Spanish (MX), Japanese, Chinese, and Hindi
- Image generation does not support audio or video inputs
- Model works best with up to 3 input images for composition
- Uploading images of children not supported in EEA, CH, and UK
- All generated images include a SynthID watermark

## Resources

- [Google Gemini API Documentation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Get API Key](https://aistudio.google.com/app/apikey)
- [Gemini Models Overview](https://ai.google.dev/gemini-api/docs/models/gemini)
- [Image Generation Cookbook](https://colab.sandbox.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Image_out.ipynb)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.