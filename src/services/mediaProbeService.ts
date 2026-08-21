import { spawn } from 'child_process';

export interface MediaInfo {
  duration: number;
  video?: { codec: string; width: number; height: number; duration?: number };
  audio?: { codec: string; sampleRate?: number; duration?: number };
}

export async function probeMedia(filePath: string): Promise<MediaInfo> {
  const output = await runProbe([
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate,duration',
    '-of', 'json',
    filePath,
  ]);
  const parsed = JSON.parse(output) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; sample_rate?: string; duration?: string }>;
  };
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(parsed.format?.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Media has no valid duration');

  return {
    duration,
    video: videoStream ? {
      codec: videoStream.codec_name,
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      duration: finitePositive(videoStream.duration),
    } : undefined,
    audio: audioStream ? {
      codec: audioStream.codec_name,
      sampleRate: Number(audioStream.sample_rate || 0) || undefined,
      duration: finitePositive(audioStream.duration),
    } : undefined,
  };
}

function finitePositive(value?: string) {
  const parsed=Number(value||0);
  return Number.isFinite(parsed)&&parsed>0?parsed:undefined;
}

function runProbe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFPROBE_PATH || 'ffprobe', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`FFprobe rejected media: ${stderr}`)));
  });
}
