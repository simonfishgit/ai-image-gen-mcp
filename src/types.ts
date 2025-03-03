/**
 * 图像生成参数接口
 * 所有参数的详细说明
 */
export interface ImageGenerationParams {
  /**
   * 描述要生成的图像内容的文本提示
   * 例如："A beautiful sunset over mountains with vibrant orange and purple colors"
   */
  prompt: string;
  
  /**
   * 输出目录路径
   * 推荐使用相对路径模式（设置use_relative_path=true）
   * 此时路径相对于映射的主机目录（如F:\work2025）
   * 例如：'mcp/images'会保存到'F:\work2025\mcp\images'
   */
  output_dir: string;
  
  /**
   * 保存图像的基本文件名
   * 如果生成多张图片，将添加数字后缀
   * 例如：设置为"sunset"，生成2张图片时，文件名将为"sunset_1.webp"和"sunset_2.webp"
   */
  filename?: string;
  
  /**
   * 是否使用快速模式生成图像
   * 可能会降低质量但提高速度
   */
  go_fast?: boolean;
  
  /**
   * 图像分辨率
   * "1" = 约100万像素(1024x1024)，默认值
   * "0.25" = 约25万像素(512x512)，较低分辨率但生成更快
   */
  megapixels?: "1" | "0.25";
  
  /**
   * 要生成的图像数量
   * 范围1-4，默认为1
   */
  num_outputs?: number;
  
  /**
   * 图像的宽高比
   * 默认为"1:1"
   */
  aspect_ratio?: "1:1" | "4:3" | "16:9";
  
  /**
   * 输出图像格式
   * 默认为"webp"
   */
  output_format?: "webp" | "png" | "jpeg";
  
  /**
   * 输出图像质量
   * 范围1-100，仅影响压缩率
   * 默认为80
   */
  output_quality?: number;
  
  /**
   * 推理步数
   * 范围4-20，步数越多质量越高但速度越慢
   * 默认为4
   */
  num_inference_steps?: number;
  
  /**
   * 当设置为true时，output_dir被视为相对于Docker容器中映射的主机目录的路径
   * 强烈推荐设置为true以确保正确保存图片
   * 例如：如果Docker运行命令为 -v F:\work2025:/app/host_data
   * 则 "output_dir": "mcp/images" 会保存到 F:\work2025\mcp\images
   */
  use_relative_path?: boolean;
}

/**
 * 图像生成响应接口
 */
export interface ImageGenerationResponse {
  /**
   * 保存的图像文件路径数组
   */
  image_paths: string[];
  
  /**
   * 元数据信息
   */
  metadata: {
    /**
     * 使用的模型名称
     */
    model: string;
    
    /**
     * 推理时间（毫秒）
     */
    inference_time_ms: number;
    
    /**
     * 是否命中缓存
     */
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