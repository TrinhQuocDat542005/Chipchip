import { Scene, VideoProject } from '../../types';

export interface VideoGenerationResult {
  url: string;
  provider: string;
  model: string;
}

export interface VideoGenerationProvider {
  readonly id: string;
  generate(scene: Scene, project: VideoProject): Promise<VideoGenerationResult>;
  healthCheck(): Promise<{ available: boolean; message: string }>;
}
