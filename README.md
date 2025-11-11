# nanobanana-mcp

A Model Context Protocol (MCP) server for creating and editing images. Built with TypeScript, this server provides powerful image manipulation capabilities through a simple MCP interface.

## Features

- **Create Images**: Generate new images with custom dimensions and background colors
- **Draw Text**: Add text to images with customizable fonts, sizes, and colors
- **Draw Shapes**: Draw rectangles and other shapes on images
- **Resize Images**: Scale images to specific dimensions with various fit modes
- **Apply Filters**: Apply effects like grayscale, blur, sharpen, negate, and rotate
- **Composite Images**: Overlay images on top of each other

## Installation

```bash
npm install -g @lpenguin/nanobanana-mcp
```

Or install locally in your project:

```bash
npm install @lpenguin/nanobanana-mcp
```

## Usage

### As an MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "npx",
      "args": ["@lpenguin/nanobanana-mcp"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "nanobanana-mcp"
    }
  }
}
```

### Available Tools

#### create_image
Create a new image with specified dimensions and background color.

**Parameters:**
- `width` (number, required): Width in pixels
- `height` (number, required): Height in pixels
- `backgroundColor` (string, optional): Background color (default: "white")
- `format` (string, optional): Output format - "png", "jpeg", or "webp" (default: "png")
- `outputPath` (string, required): Path to save the image

#### draw_text
Draw text on an existing image or create a new one.

**Parameters:**
- `inputPath` (string, optional): Path to input image
- `outputPath` (string, required): Path to save output
- `text` (string, required): Text to draw
- `x` (number, optional): X coordinate (default: 10)
- `y` (number, optional): Y coordinate (default: 30)
- `fontSize` (number, optional): Font size in pixels (default: 20)
- `fontFamily` (string, optional): Font family (default: "Arial")
- `color` (string, optional): Text color (default: "black")
- `width` (number, optional): Width for new image if no input (default: 800)
- `height` (number, optional): Height for new image if no input (default: 600)

#### draw_rectangle
Draw a rectangle on an image.

**Parameters:**
- `inputPath` (string, required): Path to input image
- `outputPath` (string, required): Path to save output
- `x` (number, required): X coordinate of top-left corner
- `y` (number, required): Y coordinate of top-left corner
- `width` (number, required): Width of rectangle
- `height` (number, required): Height of rectangle
- `fillColor` (string, optional): Fill color
- `strokeColor` (string, optional): Stroke color (default: "black")
- `lineWidth` (number, optional): Line width (default: 2)

#### resize_image
Resize an image to specified dimensions.

**Parameters:**
- `inputPath` (string, required): Path to input image
- `outputPath` (string, required): Path to save output
- `width` (number, optional): Target width in pixels
- `height` (number, optional): Target height in pixels
- `fit` (string, optional): Resize mode - "cover", "contain", "fill", "inside", or "outside" (default: "cover")

#### apply_filter
Apply a filter or effect to an image.

**Parameters:**
- `inputPath` (string, required): Path to input image
- `outputPath` (string, required): Path to save output
- `filter` (string, required): Filter to apply - "grayscale", "blur", "sharpen", "negate", or "rotate"
- `options` (object, optional): Filter-specific options (e.g., `{sigma: 5}` for blur, `{angle: 90}` for rotate)

#### composite_images
Overlay one image on top of another.

**Parameters:**
- `backgroundPath` (string, required): Path to background image
- `overlayPath` (string, required): Path to overlay image
- `outputPath` (string, required): Path to save output
- `x` (number, optional): X position of overlay (default: 0)
- `y` (number, optional): Y position of overlay (default: 0)

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/lpenguin/nanobanana-mcp.git
cd nanobanana-mcp

# Install dependencies
npm install

# Build
npm run build

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Watch mode for development
npm run watch
```

### Project Structure

```
nanobanana-mcp/
├── src/
│   └── index.ts          # Main server implementation
├── dist/                 # Compiled output (generated)
├── .github/
│   └── workflows/
│       └── publish.yml   # CI/CD workflow
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── .eslintrc.json        # ESLint configuration
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## Publishing

The package is automatically published to npm when a new version tag is pushed:

```bash
# Update version in package.json, then:
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions workflow will:
1. Run linting
2. Build the project
3. Publish to npm (if pushing a version tag)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.