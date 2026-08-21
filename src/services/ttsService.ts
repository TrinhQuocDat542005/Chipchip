import { saveProjectAsset } from './assetStorage';
import { getTTSProvider } from './tts';

export async function generateNarrationAudio(
  projectId: string,
  sceneId: string,
  text: string,
  language?: string
): Promise<{ audio_url: string; duration: number; provider: string }> {
  const provider = getTTSProvider();
  const result = await provider.synthesize({ text, language });
  const extension = result.mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
  const audioUrl = await saveProjectAsset(projectId, `${sceneId}-voice.${extension}`, result.audio);

  return {
    audio_url: audioUrl,
    duration: result.durationSeconds,
    provider: result.provider,
  };
}
