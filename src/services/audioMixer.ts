import { DubbingSegment } from '../types';

export class WebAudioTimelineMixer {
  private ctx: AudioContext | null = null;
  // Segment ids repeat between projects (seg-1, seg-2, ...), while URLs are
  // unique and also change whenever a preview is regenerated.
  private buffers: Map<string, AudioBuffer> = new Map(); // voice URL -> AudioBuffer
  private activeSources: Map<string, AudioBufferSourceNode> = new Map();
  private activeGains: Map<string, GainNode> = new Map();
  private isPlaying = false;
  private scheduleGeneration = 0;
  private originalAudioVolume = 0.25;
  private voiceVolume = 1.0;

  constructor() {
    // AudioContext will be initialized on user interaction
  }

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public async preloadSegments(segments: DubbingSegment[]): Promise<number> {
    const ctx = this.getAudioContext();
    let loadedCount = 0;
    const toLoad = segments.filter((seg) => seg.enabled && seg.voice_url && !this.buffers.has(seg.voice_url));

    const concurrency = 4;
    for (let i = 0; i < toLoad.length; i += concurrency) {
      const chunk = toLoad.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (seg) => {
          try {
            const response = await fetch(seg.voice_url!, { cache: 'no-store' });
            const arrayBuffer = await response.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            this.buffers.set(seg.voice_url!, decoded);
            loadedCount++;
          } catch (err) {
            console.warn(`[AudioMixer] Failed to load voice for segment ${seg.id}:`, err);
          }
        })
      );
    }
    return loadedCount;
  }

  public playTimeline(segments: DubbingSegment[], currentTimeSeconds: number) {
    this.stopAll();
    const ctx = this.getAudioContext();
    this.isPlaying = true;
    const generation = this.scheduleGeneration;

    const enabled = segments.filter((s) => s.enabled && s.voice_url && this.buffers.has(s.voice_url));

    for (const seg of enabled) {
      const buffer = this.buffers.get(seg.voice_url!);
      if (!buffer) continue;

      const voiceStart = seg.voice_start ?? seg.start;
      const voiceDuration = seg.voice_duration || buffer.duration;
      const voiceEnd = voiceStart + voiceDuration;

      // Check if current time is within or before the segment voice window
      if (currentTimeSeconds < voiceEnd) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Preview WAV files are already time-adjusted by FFmpeg. Applying
        // voice_speed here again would speed them up for a second time.

        const gainNode = ctx.createGain();
        gainNode.gain.value = this.voiceVolume;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        this.activeGains.set(seg.id, gainNode);

        let offset = 0;
        let delaySeconds = 0;

        if (currentTimeSeconds >= voiceStart) {
          // Already in the middle of this segment
          offset = currentTimeSeconds - voiceStart;
          delaySeconds = 0;
        } else {
          // Future segment: schedule start time
          offset = 0;
          delaySeconds = voiceStart - currentTimeSeconds;
        }

        const startTime = ctx.currentTime + delaySeconds;
        source.start(startTime, offset);
        this.activeSources.set(seg.id, source);

        source.onended = () => {
          // A stopped source may finish after a new timeline has already
          // registered another source with the same segment id.
          if (generation === this.scheduleGeneration && this.activeSources.get(seg.id) === source) {
            this.activeSources.delete(seg.id);
            this.activeGains.delete(seg.id);
          }
          source.disconnect();
        };
      }
    }
  }

  public stopAll() {
    this.isPlaying = false;
    this.scheduleGeneration++;
    for (const source of this.activeSources.values()) {
      try {
        source.stop();
        source.disconnect();
      } catch (err) {
        // Ignored
      }
    }
    this.activeSources.clear();
    this.activeGains.clear();
  }

  public setVolumes(originalVolume: number, voiceVolume: number) {
    this.originalAudioVolume = originalVolume;
    this.voiceVolume = voiceVolume;
    for (const gain of this.activeGains.values()) gain.gain.value = voiceVolume;
  }

  public invalidateVoice(voiceUrl?: string) {
    if (voiceUrl) this.buffers.delete(voiceUrl);
  }

  public clearCache() {
    this.stopAll();
    this.buffers.clear();
  }
}

export const audioMixer = new WebAudioTimelineMixer();
