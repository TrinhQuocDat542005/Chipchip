import { spawn } from 'node:child_process';
import path from 'node:path';
import { TTSProvider, TTSRequest, TTSResult } from './types';

let vieneuProcess: any = null;
let startingPromise: Promise<boolean> | null = null;

async function ensureVieNeuRunning(serviceUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${serviceUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = (await res.json()) as { ready?: boolean };
      if (data.ready) return true;
    }
  } catch (e) {
    // Service not running or loading
  }

  if (startingPromise) return startingPromise;

  startingPromise = (async () => {
    console.log('[VieNeu AutoStart] Starting VieNeu Python service on port 8787...');
    const python = process.env.VIENEU_PYTHON_PATH || path.resolve('.venv-vieneu', 'Scripts', 'python.exe');
    const script = path.resolve('services', 'vieneu', 'app.py');

    try {
      vieneuProcess = spawn(python, [script], { windowsHide: true, stdio: 'inherit' });
    } catch (err) {
      console.error('[VieNeu AutoStart Error]', err);
      startingPromise = null;
      return false;
    }

    const start = Date.now();
    while (Date.now() - start < 90_000) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`${serviceUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = (await res.json()) as { ready?: boolean };
          if (data.ready) {
            console.log('[VieNeu AutoStart] VieNeu service is ready!');
            startingPromise = null;
            return true;
          }
        }
      } catch (e) {
        // Keep polling
      }
    }
    startingPromise = null;
    return false;
  })();

  return startingPromise;
}

export class VieNeuTTSProvider implements TTSProvider {
  readonly id = 'vieneu';

  constructor(private readonly serviceUrl: string) {}

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const ready = await ensureVieNeuRunning(this.serviceUrl);
    if (!ready) {
      throw new Error(`Không thể khởi động VieNeu tại ${this.serviceUrl}. Hãy chạy npm.cmd run tts:dev rồi thử lại.`);
    }

    let response: Response;
    try {
      response = await fetch(`${this.serviceUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      throw new Error(`Mất kết nối VieNeu khi tạo giọng: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`VieNeu service returned ${response.status}: ${detail}`);
    }

    const durationSeconds = Number(response.headers.get('x-audio-duration')) || estimateDuration(request.text);
    return {
      audio: Buffer.from(await response.arrayBuffer()),
      mimeType: 'audio/wav',
      durationSeconds,
      provider: this.id,
    };
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { available: false, message: `VieNeu returned HTTP ${response.status}.` };
      const body = (await response.json()) as { model?: string; ready?: boolean };
      return {
        available: body.ready === true,
        message: body.ready ? `VieNeu is ready (${body.model || 'local model'}).` : 'VieNeu is still loading.',
      };
    } catch (error) {
      return { available: false, message: `VieNeu service is unavailable: ${(error as Error).message}` };
    }
  }
}

function estimateDuration(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 2.5));
}
