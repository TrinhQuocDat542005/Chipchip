import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { TTSProvider, TTSRequest, TTSResult } from './types';

export class EdgeTTSProvider implements TTSProvider {
  readonly id = 'edge-tts';

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const voice = request.voice || 'vi-VN-HoaiMyNeural';
    const text = request.text.trim();
    if (!text) throw new Error('Text for Edge-TTS synthesis is empty.');

    const tempDir = path.resolve('temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `edge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.mp3`);

    const pythonCandidate = [
      path.resolve('.venv-vieneu', 'Scripts', 'python.exe'),
      path.resolve('.venv-asr', 'Scripts', 'python.exe'),
      path.resolve('D:', 'AutoDub Sub', 'CapCap', '.venv', 'Scripts', 'python.exe'),
      path.resolve('D:', 'AutoDub Sub', 'pytranvideo', '.venv', 'Scripts', 'python.exe'),
      'python.exe',
    ];

    let pythonExecutable = 'python.exe';
    for (const p of pythonCandidate) {
      try {
        await fs.access(p);
        pythonExecutable = p;
        break;
      } catch (e) {
        // try next
      }
    }

    const script = path.resolve('services', 'tts', 'edge_tts_cli.py');
    const speed = request.speed ?? 1;
    const speedPercent = speed !== 1 ? `${speed > 1 ? '+' : ''}${Math.round((speed - 1) * 100)}%` : '+0%';

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonExecutable, [script, text, voice, tempFile, speedPercent], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Edge-TTS failed with code ${code}: ${stderr}`));
      });
    });

    const audioBuffer = await fs.readFile(tempFile);
    await fs.unlink(tempFile).catch(() => {});

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(1, Number((wordCount / 2.6).toFixed(2)));

    return {
      audio: audioBuffer,
      mimeType: 'audio/mpeg',
      durationSeconds,
      provider: this.id,
    };
  }

  async healthCheck() {
    return { available: true, message: 'Edge-TTS (Microsoft Neural Voices) is ready.' };
  }
}
