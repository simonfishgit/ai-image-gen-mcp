# Image Generation MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server implementation for generating images using Replicate's [`black-forest-labs/flux-schnell`](https://replicate.com/black-forest-labs/flux-schnell) model.

Ideally to be used with Cursor's MCP feature, but can be used with any MCP client.

## Features

- Generate images from text prompts
- Configurable image parameters (resolution, aspect ratio, quality)
- Save generated images to specified directory
- Full MCP protocol compliance
- Error handling and validation

## Prerequisites

- Node.js 16+
- Replicate API token
- TypeScript SDK for MCP

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Add your Replicate API token directly in the code at `src/imageService.ts` by updating the `apiToken` constant:
   ```bash
   // No environment variables are used since they can't be easily set in cursor
   const apiToken = "your-replicate-api-token-here";
   ```

   > **Note:** If using with Claude, you can create a `.env` file in the root directory and set your API token there:
   ```bash
   REPLICATE_API_TOKEN=your-replicate-api-token-here
   ```

   Then build the project:
   ```bash
   npm run build
   ```

## Docker Usage

This project provides Docker support, allowing you to run the image generation service in a Docker container.

### Building the Docker Image

```bash
# Execute in the project root directory
docker build -t mcp/image-gen .
```

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Docker

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "REPLICATE_API_TOKEN",
        "-v",
        "/path/to/host/directory:/app/host_data",
        "mcp/image-gen"
      ],
      "env": {
        "REPLICATE_API_TOKEN": "YOUR_API_TOKEN_HERE"
      }
    }
  }
}
```

#### NPX

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-image-gen"
      ],
      "env": {
        "REPLICATE_API_TOKEN": "YOUR_API_TOKEN_HERE"
      }
    }
  }
}
```

### Using Relative Paths to Save Images

When using Docker containers, it's recommended to use relative paths to save images. In the API request, set:

```json
{
  "prompt": "your prompt here",
  "output_dir": "images",
  "use_relative_path": true,
  ...
}
```

This way, images will be saved in the `images` folder under the mounted directory (e.g., `/path/to/host/directory/images/`).

## Usage

To use with cursor:
1. Go to Settings
2. Select Features
3. Scroll down to "MCP Servers"
4. Click "Add new MCP Server"
5. Set Type to "Command"
6. Set Command to: `node ./path/to/dist/server.js`

## API Parameters

| Parameter           | Type    | Required | Default | Description                                     |
|--------------------|---------|----------|---------|------------------------------------------------|
| `prompt`           | string  | Yes      | -       | Text prompt for image generation               |
| `output_dir`       | string  | Yes      | -       | Server directory path to save generated images |
| `go_fast`          | boolean | No       | false   | Enable faster generation mode                  |
| `megapixels`       | string  | No       | "1"     | Resolution quality: "1" (1024x1024, ~1M pixels), "0.25" (512x512, ~250K pixels) |
| `num_outputs`      | number  | No       | 1       | Number of images to generate (1-4)            |
| `aspect_ratio`     | string  | No       | "1:1"   | Aspect ratio ("1:1", "4:3", "16:9")          |
| `output_format`    | string  | No       | "webp"  | Image format ("webp", "png", "jpeg")         |
| `output_quality`   | number  | No       | 80      | Compression quality (1-100)                   |
| `num_inference_steps`| number| No       | 4       | Number of denoising steps (4-20), higher values increase quality but slow down generation |
| `return_image_data`| boolean | No       | false   | Return Base64 encoded image data in response |
| `use_relative_path`| boolean | No       | false   | Use paths relative to mapped host directory  |
| `filename`         | string  | No       | auto    | Base filename for saved images               |

## Example Request

```json
{
  "prompt": "black forest gateau cake spelling out 'FLUX SCHNELL'",
  "output_dir": "/var/output/images",
  "filename": "black_forest_cake",
  "output_format": "webp",
  "go_fast": true,
  "megapixels": "1",
  "num_outputs": 2,
  "aspect_ratio": "1:1"
}
```

## Example Response

```json
{
  "image_paths": [
    "/var/output/images/output_0.webp",
    "/var/output/images/output_1.webp"
  ],
  "metadata": {
    "model": "black-forest-labs/flux-schnell",
    "inference_time_ms": 2847
  }
}
```

### Response Example with Base64 Image Data

When setting `return_image_data: true`, the response will include Base64 encoded image data:

```json
{
  "image_paths": [
    "/var/output/images/output_0.webp",
    "/var/output/images/output_1.webp"
  ],
  "image_data": [
    "data:image/webp;base64,UklGRtYAAABXRUJQVlA4WAoAAAAQAAAADwAADwAAQUxQSBIAAAABF...",
    "data:image/webp;base64,UklGRtYAAABXRUJQVlA4WAoAAAAQAAAADwAADwAAQUxQSBIAAAABF..."
  ],
  "metadata": {
    "model": "black-forest-labs/flux-schnell",
    "inference_time_ms": 2847
  }
}
```

## Error Handling

The server handles the following error types:

- Validation errors (invalid parameters)
- API errors (Replicate API issues)
- Server errors (filesystem, permissions)
- Unknown errors (unexpected issues)

Each error response includes:
- Error code
- Human-readable message
- Detailed error information

## License

ISC 