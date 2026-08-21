import { GoogleGenAI } from '@google/genai';
import { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './types';

export class GeminiImageProvider implements ImageGenerationProvider {
  readonly id = 'gemini-imagen';
  private readonly model = process.env.IMAGEN_MODEL || 'imagen-3.0-generate-002';

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') throw new Error('Gemini API key is not configured');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
      model: this.model,
      prompt: `${request.prompt}, ${request.aspectRatio || '9:16'} aspect ratio, high resolution, detailed cinematic artwork`,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: request.aspectRatio || '9:16',
      },
    });
    const bytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!bytes) throw new Error('Imagen returned no image');
    return { url: `data:image/jpeg;base64,${bytes}`, provider: this.id, model: this.model };
  }

  async healthCheck() {
    const configured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    return { available: configured, message: configured ? 'Gemini Imagen is configured.' : 'Gemini API key is missing.' };
  }
}
