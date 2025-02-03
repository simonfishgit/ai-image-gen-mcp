export interface ImageGenerationParams {
  prompt: string;
  output_dir: string;
  filename?: string;
  go_fast?: boolean;
  megapixels?: "1" | "2" | "4";
  num_outputs?: number;
  aspect_ratio?: "1:1" | "4:3" | "16:9";
  output_format?: "webp" | "png" | "jpeg";
  output_quality?: number;
  num_inference_steps?: number;
}

export interface ImageGenerationResponse {
  image_paths: string[];
  metadata: {
    model: string;
    inference_time_ms: number;
    cache_hit?: boolean;
  };
}

export interface ValidationError extends Error {
  code: 'VALIDATION_ERROR';
  details: Record<string, string>;
}

export interface APIError extends Error {
  code: 'API_ERROR';
  details: {
    message: string;
    status?: number;
  };
}

export interface ServerError extends Error {
  code: 'SERVER_ERROR';
  details: {
    message: string;
    system_error?: string;
  };
} 