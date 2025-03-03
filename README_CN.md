# 图像生成 MCP 服务器

一个使用Replicate的[`black-forest-labs/flux-schnell`](https://replicate.com/black-forest-labs/flux-schnell)模型生成图像的[MCP (Model Context Protocol)](https://modelcontextprotocol.io/)服务器实现。

理想情况下与Cursor的MCP功能一起使用，但也可以与任何MCP客户端一起使用。

## 功能特点

- 根据文本提示生成图像
- 可配置的图像参数（分辨率、宽高比、质量）
- 将生成的图像保存到指定目录
- 完全符合MCP协议
- 错误处理和验证

## 前提条件

- Node.js 16+
- Replicate API令牌
- MCP的TypeScript SDK

## 设置

1. 克隆仓库
2. 安装依赖：
   ```bash
   npm install
   ```
3. 通过更新`src/imageService.ts`中的`apiToken`常量，直接在代码中添加您的Replicate API令牌：
   ```bash
   // 不使用环境变量，因为在cursor中不容易设置
   const apiToken = "你的-replicate-api-令牌";
   ```

   > **注意：** 如果与Claude一起使用，您可以在根目录中创建一个`.env`文件并在那里设置您的API令牌：
   ```bash
   REPLICATE_API_TOKEN=你的-replicate-api-令牌
   ```

   然后构建项目：
   ```bash
   npm run build
   ```

## Docker 使用说明

本项目提供了Docker支持，可以通过Docker容器运行图像生成服务。

### 构建Docker镜像

```bash
# 在项目根目录下执行
docker build -t mcp/image-gen .
```

### 运行Docker容器

```bash
# 基本用法
docker run --rm -i -e REPLICATE_API_TOKEN=your-token-here -v /path/to/host/directory:/app/host_data mcp/image-gen

# Windows环境示例
docker run --rm -i -e REPLICATE_API_TOKEN=your-token-here -v F:\work2025:/app/host_data mcp/image-gen

# 指定容器名称
docker run --name my-image-generator --rm -i -e REPLICATE_API_TOKEN=your-token-here -v /path/to/host/directory:/app/host_data mcp/image-gen
```

### 参数说明

- `--rm`: 容器停止后自动删除
- `-i`: 保持STDIN开启，允许交互式会话
- `-e REPLICATE_API_TOKEN=your-token-here`: 设置Replicate API令牌
- `-v /path/to/host/directory:/app/host_data`: 挂载主机目录到容器内的`/app/host_data`目录
- `--name my-image-generator`: 为容器指定一个名称（可选）

### 使用相对路径保存图像

当使用Docker容器时，建议使用相对路径来保存图像。在API请求中设置：

```json
{
  "prompt": "你的提示词",
  "output_dir": "images",
  "use_relative_path": true,
  ...
}
```

这样图像将保存在挂载目录下的`images`文件夹中（例如：`/path/to/host/directory/images/`）。

## 使用方法

要与cursor一起使用：
1. 进入设置
2. 选择功能
3. 向下滚动到"MCP服务器"
4. 点击"添加新的MCP服务器"
5. 将类型设置为"命令"
6. 设置命令为：`node ./path/to/dist/server.js`

## API参数

| 参数                | 类型    | 必需   | 默认值  | 描述                                        |
|--------------------|---------|--------|---------|-------------------------------------------|
| `prompt`           | string  | 是     | -       | 图像生成的文本提示                          |
| `output_dir`       | string  | 是     | -       | 保存生成图像的服务器目录路径                |
| `go_fast`          | boolean | 否     | false   | 启用更快的生成模式                          |
| `megapixels`       | string  | 否     | "1"     | 分辨率质量（"1"、"2"、"4"）                |
| `num_outputs`      | number  | 否     | 1       | 要生成的图像数量（1-4）                     |
| `aspect_ratio`     | string  | 否     | "1:1"   | 宽高比（"1:1"、"4:3"、"16:9"）             |
| `output_format`    | string  | 否     | "webp"  | 图像格式（"webp"、"png"、"jpeg"）          |
| `output_quality`   | number  | 否     | 80      | 压缩质量（1-100）                          |
| `num_inference_steps`| number| 否     | 4       | 去噪步骤数（4-20）                         |
| `return_image_data`| boolean | 否     | false   | 在响应中返回Base64编码的图像数据           |
| `use_relative_path`| boolean | 否     | false   | 使用相对于映射主机目录的路径               |
| `filename`         | string  | 否     | 自动    | 保存图像的基本文件名                       |

## 请求示例

```json
{
  "prompt": "黑森林蛋糕拼写出'FLUX SCHNELL'",
  "output_dir": "/var/output/images",
  "filename": "black_forest_cake",
  "output_format": "webp",
  "go_fast": true,
  "megapixels": "1",
  "num_outputs": 2,
  "aspect_ratio": "1:1"
}
```

## 响应示例

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

### 带有Base64图像数据的响应示例

当设置`return_image_data: true`时，响应将包含Base64编码的图像数据：

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

## 错误处理

服务器处理以下错误类型：

- 验证错误（无效参数）
- API错误（Replicate API问题）
- 服务器错误（文件系统、权限）
- 未知错误（意外问题）

每个错误响应包括：
- 错误代码
- 人类可读的消息
- 详细的错误信息

## 许可证

ISC 