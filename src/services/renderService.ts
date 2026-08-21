import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getStorageRoot, resolveMediaUrl } from './assetStorage';
import { Scene, VideoProject } from '../types';
import { probeMedia } from './mediaProbeService';

export async function renderProjectVideo(
  project: VideoProject,
  onProgress?: (progress: number, message: string) => void
): Promise<string> {
  const scenes = [...(project.scenes || [])].sort((a, b) => a.scene_number - b.scene_number);
  if (!scenes.length) throw new Error('Project has no scenes to render');

  const projectDirectory = path.join(getStorageRoot(), safeSegment(project.id));
  const workDirectory = path.join(projectDirectory, 'render-work');
  await mkdir(workDirectory, { recursive: true });

  const clipPaths: string[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    onProgress?.(82 + Math.round((index / scenes.length) * 10), `Encoding scene ${index + 1}/${scenes.length}...`);
    const visual = await materializeVisual(scene, workDirectory);
    const audioPath = resolveMediaPath(scene.audio_url);
    if (!audioPath) throw new Error(`Scene ${scene.scene_number} has no narration audio`);
    const narrationInfo = await probeMedia(audioPath);
    // Never cut narration because an LLM underestimated scene.duration.
    // Extend the visual instead; subtitles and later scenes inherit this value.
    scene.duration = Math.max(1, scene.duration, Math.ceil((narrationInfo.duration + 0.1) * 10) / 10);

    const clipPath = path.join(workDirectory, `scene-${String(index + 1).padStart(3, '0')}.mp4`);
    const visualInputArgs = visual.isVideo
      ? ['-stream_loop', '-1', '-i', visual.path]
      : ['-loop', '1', '-i', visual.path];
    await runFfmpeg([
      '-y',
      ...visualInputArgs,
      '-i', audioPath,
      '-t', String(Math.max(1, scene.duration)),
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p',
      '-af', 'apad',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '21',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-movflags', '+faststart',
      clipPath,
    ]);
    clipPaths.push(clipPath);
  }

  const concatFile = path.join(workDirectory, 'clips.txt');
  await writeFile(concatFile, clipPaths.map((clip) => `file '${escapeConcatPath(clip)}'`).join('\n'), 'utf8');
  const combinedPath = path.join(workDirectory, 'combined.mp4');
  onProgress?.(94, 'Combining scene clips...');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', combinedPath]);

  const subtitleContents = createSrt(scenes);
  const subtitlePath = path.join(workDirectory, 'subtitles.srt');
  await writeFile(subtitlePath, subtitleContents, 'utf8');
  await writeFile(path.join(projectDirectory, 'subtitles.srt'), subtitleContents, 'utf8');
  const finalPath = path.join(projectDirectory, 'final.mp4');
  onProgress?.(97, 'Burning subtitles and encoding final MP4...');
  const musicPath = project.bg_music_url ? resolveMediaUrl(project.bg_music_url) : null;
  const subtitleFilter = `subtitles=subtitles.srt:force_style='FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=130'`;
  if (musicPath) {
    const musicVolume = Math.max(0, Math.min(1, project.bg_music_volume ?? 0.2));
    await runFfmpeg([
      '-y', '-i', combinedPath, '-stream_loop', '-1', '-i', musicPath,
      '-filter_complex', `[0:v]${subtitleFilter}[v];[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[voice];[1:a]volume=${musicVolume}[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart', finalPath,
    ], workDirectory);
  } else {
    await runFfmpeg([
      '-y', '-i', combinedPath, '-vf', subtitleFilter,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart', finalPath,
    ], workDirectory);
  }

  return `/media/${safeSegment(project.id)}/final.mp4`;
}

async function materializeVisual(scene: Scene, workDirectory: string): Promise<{ path: string; isVideo: boolean }> {
  const source = scene.video_url || scene.image_url;
  if (!source) throw new Error(`Scene ${scene.scene_number} has no visual asset`);

  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;,]+)(;(base64|utf8))?,(.*)$/s);
    if (!match) throw new Error(`Scene ${scene.scene_number} has an invalid data URL`);
    const mimeType = match[1];
    const isVideo = mimeType.startsWith('video/');
    const extension = isVideo ? 'mp4' : mimeType.includes('svg') ? 'svg' : mimeType.includes('png') ? 'png' : 'jpg';
    const contents = match[3] === 'base64' ? Buffer.from(match[4], 'base64') : Buffer.from(decodeURIComponent(match[4]), 'utf8');
    const filePath = path.join(workDirectory, `visual-${scene.scene_number}.${extension}`);
    await writeFile(filePath, contents);
    return { path: filePath, isVideo };
  }

  if (source.startsWith('/media/')) {
    const localPath = resolveMediaUrl(source);
    if (!localPath) throw new Error(`Invalid media URL for scene ${scene.scene_number}`);
    return { path: localPath, isVideo: /\.(mp4|mov|webm)$/i.test(localPath) };
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Could not download scene ${scene.scene_number} visual (${response.status})`);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const isVideo = mimeType.startsWith('video/');
    const extension = isVideo ? 'mp4' : mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const filePath = path.join(workDirectory, `visual-${scene.scene_number}.${extension}`);
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    return { path: filePath, isVideo };
  }

  throw new Error(`Unsupported visual URL for scene ${scene.scene_number}`);
}

function resolveMediaPath(url?: string): string | null {
  return url ? resolveMediaUrl(url) : null;
}

function createSrt(scenes: Scene[]) {
  let start = 0;
  return scenes.map((scene, index) => {
    const end = start + Math.max(1, scene.duration);
    const block = `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${(scene.subtitle || scene.narration).trim()}\n`;
    start = end;
    return block;
  }).join('\n');
}

function formatSrtTime(totalSeconds: number) {
  const milliseconds = Math.round(totalSeconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, '0')}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function runFfmpeg(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true, cwd });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-12_000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function escapeConcatPath(value: string) {
  return value.replace(/\\/g, '/').replace(/'/g, "'\\''");
}
