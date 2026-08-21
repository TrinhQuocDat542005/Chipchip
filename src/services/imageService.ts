import { getImageProvider } from './image';

export async function generateSceneImage(prompt: string, sceneNumber: number, topic: string, aspectRatio: '9:16'|'16:9'|'1:1'='9:16'): Promise<string> {
  const selected = getImageProvider();
  try {
    return (await selected.generate({ prompt, sceneNumber, topic, aspectRatio })).url;
  } catch (error) {
    if (selected.id === 'placeholder') throw error;
    console.warn(`[ImageService] ${selected.id} failed; using local placeholder:`, error);
    const { PlaceholderImageProvider } = await import('./image/placeholderImageProvider');
    return (await new PlaceholderImageProvider().generate({ prompt, sceneNumber, topic, aspectRatio })).url;
  }
}
