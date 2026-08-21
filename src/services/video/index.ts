import { LocalMotionVideoProvider } from './localMotionVideoProvider';
import { VideoGenerationProvider } from './types';
import { ManualVideoProvider } from './manualVideoProvider';

let provider: VideoGenerationProvider | undefined;

export function getVideoProvider() {
  if (!provider) provider = new LocalMotionVideoProvider();
  return provider;
}

export function setVideoProvider(id: string) {
  provider = id === 'manual' ? new ManualVideoProvider() : new LocalMotionVideoProvider();
  return provider;
}

export type { VideoGenerationProvider, VideoGenerationResult } from './types';
