import { VideoGenerationProvider } from './types';

export class ManualVideoProvider implements VideoGenerationProvider {
  readonly id = 'manual';
  async generate(): Promise<never> {
    throw new Error('Manual video provider selected. Upload an MP4 clip for this scene.');
  }
  async healthCheck() {
    return { available: true, message: 'Manual prompt-copy and MP4 upload fallback is ready.' };
  }
}
