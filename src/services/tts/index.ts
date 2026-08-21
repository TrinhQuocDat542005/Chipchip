import { MockTTSProvider } from './mockTTSProvider';
import { TTSProvider } from './types';
import { VieNeuTTSProvider } from './vieNeuTTSProvider';
import { EdgeTTSProvider } from './edgeTTSProvider';

let provider: TTSProvider | undefined;

export function getTTSProvider(providerId?: string): TTSProvider {
  const id = (providerId || process.env.TTS_PROVIDER || 'vieneu').toLowerCase();
  if (id === 'edge-tts' || id.startsWith('vi-vn-') || id.startsWith('zh-cn-') || id.startsWith('en-us-')) {
    return new EdgeTTSProvider();
  }
  if (id === 'vieneu' || id === 'co-gai-hoat-ngon' || id === 'default') {
    return new VieNeuTTSProvider(process.env.VIENEU_SERVICE_URL || 'http://127.0.0.1:8787');
  }
  return new MockTTSProvider();
}

export function setTTSProvider(id: string) {
  provider = getTTSProvider(id);
  return provider;
}

export type { TTSProvider, TTSRequest, TTSResult } from './types';
