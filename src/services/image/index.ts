import { GeminiImageProvider } from './geminiImageProvider';
import { PlaceholderImageProvider } from './placeholderImageProvider';
import { ImageGenerationProvider } from './types';

let provider: ImageGenerationProvider | undefined;

export function getImageProvider() {
  if (provider) return provider;
  provider = (process.env.IMAGE_PROVIDER || 'placeholder').toLowerCase() === 'gemini'
    ? new GeminiImageProvider()
    : new PlaceholderImageProvider();
  return provider;
}

export function setImageProvider(id: string) {
  provider = id === 'gemini' ? new GeminiImageProvider() : new PlaceholderImageProvider();
  return provider;
}

export type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './types';
