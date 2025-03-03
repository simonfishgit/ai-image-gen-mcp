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

/**
 * 图像生成工具使用说明：
 * 
 * 路径使用指南：
 * 1. 推荐使用相对路径模式（use_relative_path=true）：
 *    - 所有路径都相对于Docker容器中映射的主机目录
 *    - 默认为/app/host_data，但可通过环境变量OUTPUT_DIR自定义
 *    - 例如：如果Docker运行命令为 -v F:\work2025:/app/host_data
 *      则 "output_dir": "mcp/images" 会保存到 F:\work2025\mcp\images
 * 
 * 2. 路径格式建议：
 *    - 使用简单的相对路径：如 "mcp/images"
 *    - 可以使用类Unix风格的路径：如 "/mcp/images"（仍然相对于映射根目录）
 *    - 避免使用Windows风格的绝对路径，特别是在相对路径模式下
 * 
 * 3. 图像质量参数说明：
 *    - megapixels: 控制图像分辨率，可选值为 "1"、"0.25"
 *      "1" = 约100万像素（默认，如1024x1024）
 *      "0.25" = 约25万像素（如512x512），较低分辨率但生成更快
 *    - num_inference_steps: 推理步数，范围4-20，步数越多质量越高但速度越慢
 *    - output_quality: 输出图像质量，范围1-100，仅影响压缩率不影响生成质量
 */

// Register the image generation tool
server.tool(
  "generate-image",
  "Generate an image based on a prompt",
  {
    prompt: z.string().describe("描述要生成的图像内容的文本提示"),
    output_dir: z.string().describe("输出目录路径。推荐使用相对路径模式（设置use_relative_path=true），此时路径相对于映射的主机目录（如F:\\work2025）。例如：'mcp/images'会保存到'F:\\work2025\\mcp\\images'。避免使用Windows风格的绝对路径。"),
    filename: z.string().optional().describe("保存图像的基本文件名。如果生成多张图片，将添加数字后缀"),
    go_fast: z.boolean().optional().describe("是否使用快速模式生成图像，可能会降低质量但提高速度"),
    megapixels: z.enum(["1", "0.25"]).optional().describe("图像分辨率，'1'=约100万像素(1024x1024)，'0.25'=约25万像素(512x512)。默认为'1'"),
    num_outputs: z.number().min(1).max(4).optional().describe("要生成的图像数量，范围1-4，默认为1"),
    aspect_ratio: z.enum(["1:1", "4:3", "16:9"]).optional().describe("图像的宽高比，默认为'1:1'"),
    output_format: z.enum(["webp", "png", "jpeg"]).optional().describe("输出图像格式，默认为'webp'"),
    output_quality: z.number().min(1).max(100).optional().describe("输出图像质量，范围1-100，仅影响压缩率，默认为80"),
    num_inference_steps: z.number().min(4).max(20).optional().describe("推理步数，范围4-20，步数越多质量越高但速度越慢，默认为4"),
    use_relative_path: z.boolean().optional().describe("当设置为true时，output_dir被视为相对于Docker容器中映射的主机目录的路径。强烈推荐设置为true以确保正确保存图片")
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
    
    // 获取实际使用的主机数据目录
    const hostDataDir = process.env.OUTPUT_DIR || '/app/host_data';
    console.error(`Host data directory mapped to: ${hostDataDir}`);
    console.error("Use use_relative_path=true to specify paths relative to the mapped directory");
    console.error(`Example: 'output_dir': 'mcp/images' with use_relative_path=true will save to mapped host directory + /mcp/images`);
}

main().catch(async (error) => {
    const fs = require('fs').promises;
    await fs.appendFile('server.log', `${new Date().toISOString()} - ${error.stack || error}\n`);
    console.error(error);
    process.exit(1);
});