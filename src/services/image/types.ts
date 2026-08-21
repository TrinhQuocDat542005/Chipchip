export interface ImageGenerationRequest {
  prompt: string;
  sceneNumber: number;
  topic: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
}

export interface ImageGenerationResult {
  url: string;
  provider: string;
  model: string;
}

export interface ImageGenerationProvider {
  readonly id: string;
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  healthCheck(): Promise<{ available: boolean; message: string }>;
}
