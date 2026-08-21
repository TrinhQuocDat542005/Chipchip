import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getStorageRoot, resolveMediaUrl, saveProjectAsset } from '../assetStorage';
import { VideoGenerationProvider } from './types';
import { Scene, VideoProject } from '../../types';

export class LocalMotionVideoProvider implements VideoGenerationProvider {
  readonly id = 'local-motion';

  async generate(scene: Scene, project: VideoProject) {
    if (!scene.image_url) throw new Error('Generate the scene image before video');
    const input = await materializeImage(scene, project.id);
    const outputDirectory = path.join(getStorageRoot(), project.id.replace(/[^a-zA-Z0-9._-]/g, '_'), 'motion-work');
    await mkdir(outputDirectory, { recursive: true });
    const output = path.join(outputDirectory, `${scene.id.replace(/[^a-zA-Z0-9._-]/g, '_')}.mp4`);
    const increment = scene.motion_intensity === 'High' ? '0.0015' : scene.motion_intensity === 'Low' ? '0.0005' : '0.0009';
    const frames = Math.max(30, Math.round(scene.duration * 30));
    const zoom = scene.camera_movement === 'Static' ? '1' : `min(zoom+${increment},1.16)`;
    const filter = `scale=1200:2134:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`;
    await runFfmpeg(['-y', '-loop', '1', '-i', input, '-vf', filter, '-t', String(scene.duration), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', output]);
    const bytes = await import('node:fs/promises').then((fs) => fs.readFile(output));
    const url = await saveProjectAsset(project.id, `${scene.id}-motion.mp4`, bytes);
    return { url, provider: this.id, model: 'ffmpeg-zoompan-v1' };
  }

  async healthCheck() {
    try {
      await runFfmpeg(['-version']);
      return { available: true, message: 'Local FFmpeg motion provider is ready.' };
    } catch (error) {
      return { available: false, message: (error as Error).message };
    }
  }
}

async function materializeImage(scene: Scene, projectId: string) {
  const local = resolveMediaUrl(scene.image_url!);
  if (local) return local;
  if (/^https?:\/\//i.test(scene.image_url!)) {
    const response = await fetch(scene.image_url!, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Could not download scene image (${response.status})`);
    const directory = path.join(getStorageRoot(), projectId.replace(/[^a-zA-Z0-9._-]/g, '_'), 'motion-work');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${scene.id}-source.jpg`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    return file;
  }
  throw new Error('Unsupported scene image URL');
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-6000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg motion generation failed: ${stderr}`)));
  });
}
