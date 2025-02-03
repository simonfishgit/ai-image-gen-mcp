import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ImageGenerationService } from './imageService.js';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';

// Load environment variables
dotenv.config();

const imageService = new ImageGenerationService();

const server = new McpServer({
  name: "image-generator",
  version: "1.0.0"
});

// Register the image generation tool
server.tool(
  "generate-image",
  "Generate an image based on a prompt",
  {
    prompt: z.string(),
    output_dir: z.string().describe("Full absolute path to output directory. For Windows, use double backslashes like 'C:\\\\Users\\\\name\\\\path'. For Unix/Mac use '/path/to/dir'. Always use the proper path otherwise you will get an error."),
    filename: z.string().optional().describe("Base filename to save the image(s) with"),
    go_fast: z.boolean().optional(),
    megapixels: z.enum(["1", "2", "4"]).optional(),
    num_outputs: z.number().min(1).max(4).optional(),
    aspect_ratio: z.enum(["1:1", "4:3", "16:9"]).optional(),
    output_format: z.enum(["webp", "png", "jpeg"]).optional(),
    output_quality: z.number().min(1).max(100).optional(),
    num_inference_steps: z.number().min(4).max(20).optional()
  },
  async (params) => {
    try {
      const result = await imageService.generateImages(params);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }]
      };
    }
  }
);


async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Image Generation MCP Server running on stdio");
}

main().catch(async (error) => {
    const fs = require('fs').promises;
    await fs.appendFile('server.log', `${new Date().toISOString()} - ${error.stack || error}\n`);
    console.error(error);
    process.exit(1);
});