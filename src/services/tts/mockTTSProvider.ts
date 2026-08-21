import { TTSProvider, TTSRequest, TTSResult } from './types';

export class MockTTSProvider implements TTSProvider {
  readonly id = 'mock';

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const words = request.text.trim().split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(1, Math.ceil(words / 2.5));
    const sampleRate = 22050;
    const samples = new Float32Array(sampleRate * durationSeconds);

    for (let index = 0; index < samples.length; index += 1) {
      const time = index / sampleRate;
      const frequency = 220 + Math.sin(time * 8) * 40;
      const envelope = Math.min(1, Math.sin((time / durationSeconds) * Math.PI));
      samples[index] = Math.sin(2 * Math.PI * frequency * time) * 0.12 * envelope;
    }

    return {
      audio: createWavBuffer(samples, sampleRate),
      mimeType: 'audio/wav',
      durationSeconds,
      provider: this.id,
    };
  }

  async healthCheck() {
    return { available: true, message: 'Mock TTS is available for pipeline testing only.' };
  }
}

function createWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + index * 2);
  }

  return buffer;
}
