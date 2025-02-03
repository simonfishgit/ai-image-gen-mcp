import Replicate from 'replicate';
import * as fs from 'fs';
import * as path from 'path';
import { ImageGenerationParams, ImageGenerationResponse, APIError, ServerError } from './types.js';
import { createHash } from 'crypto';
import { promises as fsPromises } from 'fs';


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
      output_dir: params.output_dir
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
      // Check cache first
      const cacheKey = this.generateCacheKey(params);
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
        params.output_dir,
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
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Prepare download tasks
    const downloadTasks = imageUrls.map(async (imageUrl, i) => {
      const filename = baseFilename 
        ? (imageUrls.length > 1 ? `${baseFilename}_${i + 1}.${format}` : `${baseFilename}.${format}`)
        : `output_${i}.${format}`;
      const filePath = path.join(outputDir, filename);

      try {
        // Download image with retry mechanism
        const buffer = await this.downloadWithRetry(imageUrl);
        
        // Save image atomically using temporary file
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, buffer);
        fs.renameSync(tempPath, filePath);
        
        return filePath;
      } catch (error: any) {
        const serverError = new Error('Failed to save image') as ServerError;
        serverError.code = 'SERVER_ERROR';
        serverError.details = {
          message: `Failed to save image ${i}`,
          system_error: error.message
        };
        throw serverError;
      }
    });

    // Execute all downloads in parallel with a concurrency limit
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