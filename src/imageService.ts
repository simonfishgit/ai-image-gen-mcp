import Replicate from 'replicate';
import * as fs from 'fs';
import * as path from 'path';
import { ImageGenerationParams, ImageGenerationResponse, APIError, ServerError } from './types.js';
import { createHash } from 'crypto';
import { promises as fsPromises } from 'fs';

/**
 * 图像服务实现说明：
 * 
 * 路径处理逻辑：
 * - 当use_relative_path=true时，所有路径都相对于HOST_DATA_ROOT（默认为/app/host_data）
 * - 路径会经过规范化处理，防止目录遍历攻击（如使用../尝试访问映射目录之外的文件）
 * - 支持类Unix风格的路径（以斜杠开头），但仍然相对于映射根目录
 * 
 * 图像质量参数：
 * - megapixels: 控制图像分辨率
 *   "1" = 约100万像素（1024x1024），默认值
 *   "0.25" = 约25万像素（512x512），较低分辨率但生成更快
 * - 更高的分辨率需要更多的计算资源和时间
 * 
 * 示例使用方法：
 * 1. 基本用法（推荐）：
 *    {
 *      "prompt": "A beautiful sunset over mountains",
 *      "output_dir": "mcp/sunset_images",
 *      "use_relative_path": true
 *    }
 * 
 * 2. 高质量图像：
 *    {
 *      "prompt": "A detailed portrait of a cat",
 *      "output_dir": "mcp/cat_images",
 *      "use_relative_path": true,
 *      "megapixels": "1",
 *      "num_inference_steps": 12,
 *      "output_format": "png"
 *    }
 * 
 * 3. 低分辨率快速生成：
 *    {
 *      "prompt": "Abstract digital art",
 *      "output_dir": "mcp/art",
 *      "filename": "abstract_art",
 *      "use_relative_path": true,
 *      "megapixels": "0.25",
 *      "go_fast": true
 *    }
 * 
 * 4. 生成多张图像：
 *    {
 *      "prompt": "Colorful flowers in a garden",
 *      "output_dir": "mcp/flowers",
 *      "filename": "flower",
 *      "use_relative_path": true,
 *      "num_outputs": 2
 *    }
 */

// 定义容器内映射的根目录
// 从环境变量OUTPUT_DIR中读取，如果未设置则使用默认值'/app/host_data'
const HOST_DATA_ROOT = process.env.OUTPUT_DIR || '/app/host_data';

const apiToken = process.env.REPLICATE_API_TOKEN || "YOUR API TOKEN HERE";

export class ImageGenerationService {
  private replicate: Replicate;

  private readonly MODEL = 'black-forest-labs/flux-schnell';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // ms
  private readonly cache = new Map<string, { 
    response: ImageGenerationResponse;
    timestamp: number;
  }>();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

  constructor() {
   
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required');
    }

    this.replicate = new Replicate({ auth: apiToken });

    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), this.CACHE_TTL);
  }

  private generateCacheKey(params: ImageGenerationParams): string {
    const relevantParams = {
      prompt: params.prompt,
      go_fast: params.go_fast ?? false,
      megapixels: params.megapixels ?? "1",
      num_outputs: params.num_outputs ?? 1,
      aspect_ratio: params.aspect_ratio ?? "1:1",
      num_inference_steps: params.num_inference_steps ?? 1,
      output_dir: params.output_dir,
      use_relative_path: params.use_relative_path ?? false
    };
    return createHash('sha256')
      .update(JSON.stringify(relevantParams))
      .digest('hex');
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  async generateImages(params: ImageGenerationParams): Promise<ImageGenerationResponse> {
    const startTime = Date.now();

    try {
      // 处理路径转换
      let outputDir = params.output_dir;
      if (params.use_relative_path) {
        // 确保路径安全，防止目录遍历攻击
        // 1. 规范化路径（解析 . 和 ..）
        // 2. 移除开头的 .. 序列，防止访问映射目录之外的文件
        const normalizedPath = path.normalize(params.output_dir).replace(/^(\.\.(\/|\\|$))+/, '');
        
        // 将相对路径与映射根目录（/app/host_data）结合
        // 这确保所有文件都保存在映射的卷内
        outputDir = path.join(HOST_DATA_ROOT, normalizedPath);
        
        // 记录路径转换信息，帮助调试
        console.error(`Path conversion: "${params.output_dir}" -> "${outputDir}"`);
      } else {
        // 当不使用相对路径时，直接使用提供的路径
        // 注意：这种模式下，只有映射卷内的路径才能正确保存文件
        console.error(`Using direct path: "${outputDir}". Make sure this path is accessible from the container.`);
      }

      // 检查缓存
      const cacheKey = this.generateCacheKey({...params, output_dir: outputDir});
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        // Verify files still exist
        const allFilesExist = cached.response.image_paths.every(path => fs.existsSync(path));
        if (allFilesExist) {
          return {
            ...cached.response,
            metadata: {
              ...cached.response.metadata,
              cache_hit: true
            }
          };
        }
        // If files don't exist, remove from cache
        this.cache.delete(cacheKey);
      }

      // Prepare model input
      const modelInput = {
        prompt: params.prompt,
        go_fast: params.go_fast ?? false,
        megapixels: params.megapixels ?? "1",
        num_outputs: params.num_outputs ?? 1,
        aspect_ratio: params.aspect_ratio ?? "1:1",
        num_inference_steps: params.num_inference_steps ?? 4
      };

      // Call Replicate API
      const output = await this.replicate.run(
        this.MODEL,
        { input: modelInput }
      ) as string[];

      // Download and save images
      const imagePaths = await this.saveImages(
        output,
        outputDir,
        params.output_format ?? 'webp',
        params.output_quality ?? 80,
        params.filename
      );

      const endTime = Date.now();

      const response: ImageGenerationResponse = {
        image_paths: imagePaths,
        metadata: {
          model: this.MODEL,
          inference_time_ms: endTime - startTime,
          cache_hit: false
        }
      };

      // Cache the result
      this.cache.set(cacheKey, {
        response,
        timestamp: Date.now()
      });

      return response;

    } catch (error: any) {

      if (error.response) {
        const apiError = new Error(error.message) as APIError;
        apiError.code = 'API_ERROR';
        apiError.details = {
          message: error.message,
          status: error.response.status
        };
        throw apiError;
      }

      const serverError = new Error('Server error occurred') as ServerError;
      serverError.code = 'SERVER_ERROR';
      serverError.details = {
        message: 'Failed to generate or save images',
        system_error: error.message
      };
      throw serverError;
    }
  }

  private async downloadWithRetry(
    url: string,
    retries = this.MAX_RETRIES
  ): Promise<Buffer> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`);
        }
        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * (i + 1)));
      }
    }
    throw new Error('Failed to download after retries');
  }

  private async saveImages(
    imageUrls: string[],
    outputDir: string,
    format: 'webp' | 'png' | 'jpeg',
    quality: number,
    baseFilename?: string
  ): Promise<string[]> {
    // 创建输出目录（如果不存在）
    try {
      console.error(`Attempting to save images to directory: ${outputDir}`);
      
      if (!fs.existsSync(outputDir)) {
        console.error(`Directory does not exist, creating: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
        console.error(`Directory created successfully: ${outputDir}`);
      } else {
        console.error(`Directory already exists: ${outputDir}`);
      }
    } catch (error: any) {
      console.error(`Error creating directory ${outputDir}: ${error.message}`);
      // 提供更详细的错误信息，帮助用户排查问题
      if (error.code === 'EACCES') {
        console.error('Permission denied. Check if the container has write access to this location.');
      } else if (error.code === 'ENOENT') {
        console.error('Parent directory does not exist. Check the path is correct and accessible.');
      } else if (error.code === 'ENOTDIR') {
        console.error('Part of the path is not a directory. Check the path structure.');
      }
      
      const serverError = new Error('Failed to create output directory') as ServerError;
      serverError.code = 'SERVER_ERROR';
      serverError.details = {
        message: `Failed to create output directory: ${outputDir}`,
        system_error: error.message
      };
      throw serverError;
    }

    // 准备下载任务
    console.error(`Preparing to download ${imageUrls.length} images`);
    const downloadTasks = imageUrls.map(async (imageUrl, i) => {
      // 构建文件名：如果提供了基本文件名，则使用它，否则使用默认名称
      const filename = baseFilename 
        ? (imageUrls.length > 1 ? `${baseFilename}_${i + 1}.${format}` : `${baseFilename}.${format}`)
        : `output_${i}.${format}`;
      const filePath = path.join(outputDir, filename);
      
      console.error(`Preparing to save image ${i+1}/${imageUrls.length} to: ${filePath}`);

      try {
        // 使用重试机制下载图像
        console.error(`Downloading image from: ${imageUrl}`);
        const buffer = await this.downloadWithRetry(imageUrl);
        console.error(`Download successful, image size: ${buffer.length} bytes`);
        
        // 使用临时文件原子性保存图像
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, buffer);
        fs.renameSync(tempPath, filePath);
        console.error(`Image saved successfully to: ${filePath}`);
        
        return filePath;
      } catch (error: any) {
        console.error(`Failed to save image to ${filePath}: ${error.message}`);
        const serverError = new Error('Failed to save image') as ServerError;
        serverError.code = 'SERVER_ERROR';
        serverError.details = {
          message: `Failed to save image ${i} to ${filePath}`,
          system_error: error.message
        };
        throw serverError;
      }
    });

    // 并行执行所有下载，但有并发限制
    const CONCURRENCY_LIMIT = 3;
    const imagePaths: string[] = [];
    
    for (let i = 0; i < downloadTasks.length; i += CONCURRENCY_LIMIT) {
      const batch = downloadTasks.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(batch);
      imagePaths.push(...results);
    }

    return imagePaths;
  }
} 