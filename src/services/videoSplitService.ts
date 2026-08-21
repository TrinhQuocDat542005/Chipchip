import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DubbingProject } from '../types';
import { getStorageRoot, resolveMediaUrl } from './assetStorage';

export interface SafeSplitPoint {
  time: number;
  silence_start: number;
  silence_end: number;
  silence_duration: number;
  safe: boolean;
}

export async function analyzeSafeSplitPoints(project: DubbingProject, targetMinutes = 8, minMinutes = 5, maxMinutes = 10) {
  const input = resolveMediaUrl(project.source_video_url);
  if (!input) throw new Error('Không tìm thấy video nguồn.');
  if (project.duration <= maxMinutes * 60) return { points: [], duration: project.duration, needs_split: false };

  const stderr = await runFfmpeg([
    '-hide_banner', '-nostats', '-i', input, '-vn',
    // A moderate threshold detects dialogue pauses even when quiet background
    // music continues; candidate points are still cross-checked with ASR gaps.
    '-af', 'silencedetect=noise=-22dB:d=0.40', '-f', 'null', '-',
  ], 45 * 60_000);
  const detectedSilences = parseSilences(stderr);
  // Music beds often prevent true digital silence. Existing ASR boundaries are
  // a stronger signal: a gap between two utterances cannot be inside either line.
  const orderedSegments = project.segments
    .filter(segment => segment.enabled !== false)
    .sort((a, b) => a.start - b.start);
  const speechGaps = orderedSegments
    .slice(1)
    .map((segment, index) => {
      const previous = orderedSegments[index];
      const start = previous.end;
      const end = segment.start;
      return { start, end, duration: end - start };
    })
    .filter(gap => gap.duration >= 0.35);
  const silences = [...detectedSilences, ...speechGaps]
    .sort((a, b) => a.start - b.start)
    .filter((gap, index, all) => index === 0 || Math.abs(gap.start - all[index - 1].start) > 0.1);
  const points: SafeSplitPoint[] = [];
  const target = targetMinutes * 60;
  const min = minMinutes * 60;
  const max = maxMinutes * 60;
  let previous = 0;

  while (project.duration - previous > max) {
    const ideal = previous + target;
    const candidates = silences.filter(s => {
      const middle = (s.start + s.end) / 2;
      return middle >= previous + min && middle <= Math.min(previous + max, project.duration - min);
    });
    const chosen = candidates.sort((a, b) => {
      const scoreA = Math.abs((a.start + a.end) / 2 - ideal) - Math.min(a.duration, 2) * 8;
      const scoreB = Math.abs((b.start + b.end) / 2 - ideal) - Math.min(b.duration, 2) * 8;
      return scoreA - scoreB;
    })[0];
    if (chosen) {
      const time = round((chosen.start + chosen.end) / 2);
      points.push({ time, silence_start: round(chosen.start), silence_end: round(chosen.end), silence_duration: round(chosen.duration), safe: true });
      previous = time;
    } else {
      // A fallback is displayed for manual review, never labelled as safe.
      const time = round(Math.min(ideal, project.duration - min));
      points.push({ time, silence_start: time, silence_end: time, silence_duration: 0, safe: false });
      previous = time;
    }
  }
  return { points, duration: project.duration, needs_split: points.length > 0, silence_count: silences.length, source: speechGaps.length ? 'speech-gaps+silence' : 'silence-only' };
}

export async function splitVideoIntoFiles(project: DubbingProject, cutPoints: number[]) {
  const input = resolveMediaUrl(project.source_video_url);
  if (!input) throw new Error('Không tìm thấy video nguồn.');
  const boundaries = [0, ...cutPoints, project.duration];
  const results: Array<{ url: string; start: number; end: number; duration: number }> = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const childId = `${project.id}-part-${String(index + 1).padStart(2, '0')}`;
    const directory = path.join(getStorageRoot(), childId.replace(/[^a-zA-Z0-9._-]/g, '_'));
    await mkdir(directory, { recursive: true });
    const output = path.join(directory, 'source.mp4');
    await runFfmpeg([
      // Decode up to the requested timestamp and re-encode so every child
      // starts at the exact selected frame. Stream-copy seeks to a previous
      // keyframe and can shift audio/video by a GOP.
      '-y', '-hide_banner', '-i', input, '-ss', start.toFixed(3),
      '-t', (end - start).toFixed(3), '-map', '0:v:0', '-map', '0:a:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', output,
    ], 45 * 60_000);
    results.push({ url: `/media/${path.basename(directory)}/source.mp4`, start, end, duration: end - start });
  }
  return results;
}

function parseSilences(stderr: string) {
  const starts: number[] = [];
  const result: Array<{ start: number; end: number; duration: number }> = [];
  for (const line of stderr.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*([\d.]+)/);
    if (start) starts.push(Number(start[1]));
    const end = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (end) result.push({ start: starts.shift() ?? Math.max(0, Number(end[1]) - Number(end[2])), end: Number(end[1]), duration: Number(end[2]) });
  }
  return result;
}

function runFfmpeg(args: string[], timeout: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Phân tích/chia video quá thời gian.')); }, timeout);
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stderr) : reject(new Error(`FFmpeg thất bại (${code}): ${stderr.slice(-2000)}`)); });
  });
}

const round = (value: number) => Math.round(value * 1000) / 1000;
