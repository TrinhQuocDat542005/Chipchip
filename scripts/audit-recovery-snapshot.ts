import { DatabaseSync } from 'node:sqlite';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DubbingProject } from '../src/types';
import { buildReadableSrt } from '../src/services/dubbingService';
import { resolveMediaUrl } from '../src/services/assetStorage';
import { probeMedia } from '../src/services/mediaProbeService';
import { mapWithConcurrency } from '../src/services/renderRuntime';

const snapshotId = process.argv[2] || 'snap-1787298119214-0w7el';
const candidateOutput = process.argv[3] || path.resolve('storage', '_recovery', 'snapshot-candidate-translated.srt');

function parseSrt(srt: string) {
  const time = (value: string) => {
    const [hours, minutes, rest] = value.replace(',', '.').split(':');
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest);
  };
  return [...srt.matchAll(/(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?)(?=\n\s*\n|$)/g)]
    .map((match) => ({ start: time(match[1]), end: time(match[2]), text: match[3].replace(/\s+/g, '') }));
}

async function main() {
  const database = new DatabaseSync('data/video-factory.db', { readOnly: true });
  try {
    const row = database.prepare('SELECT data FROM project_snapshots WHERE id=?').get(snapshotId) as { data: string } | undefined;
    if (!row) throw new Error(`Snapshot not found: ${snapshotId}`);
    const project = JSON.parse(row.data) as DubbingProject;
    const results = await mapWithConcurrency(project.segments, 6, async (segment) => {
      const filePath = segment.voice_url ? resolveMediaUrl(segment.voice_url) : null;
      if (!filePath) return { id: segment.id, passed: false, reason: 'missing_voice_path' };
      try {
        const info = await probeMedia(filePath);
        const actualDuration = info.audio?.duration ?? info.duration;
        const slotDuration = Math.max(.1, segment.end - segment.start);
        const words = segment.translated_text.trim().split(/\s+/).filter(Boolean).length;
        const overflowPct = actualDuration > slotDuration * 1.05 ? (actualDuration - slotDuration) / slotDuration * 100 : 0;
        const wps = actualDuration > slotDuration * 1.05 ? words / actualDuration : words / slotDuration;
        const passed = overflowPct <= 10 && (words <= 4 || actualDuration > slotDuration * 1.05 || wps <= 4.2);
        return { id: segment.id, passed, reason: passed ? 'PASS' : overflowPct > 10 ? 'two_tier_overflow' : 'two_tier_wps', actual_duration: actualDuration, db_duration: segment.voice_duration, duration_delta: Math.abs(actualDuration - (segment.voice_duration ?? actualDuration)), overflow_pct: overflowPct, wps };
      } catch (error) {
        return { id: segment.id, passed: false, reason: `probe_failed:${(error as Error).message}` };
      }
    });

    const srt = buildReadableSrt(project.segments.filter((segment) => segment.enabled));
    await writeFile(candidateOutput, srt, 'utf8');
    const cues = parseSrt(srt);
    const cps = cues.map((cue) => cue.text.length / Math.max(.1, cue.end - cue.start));
    const gaps = cues.slice(1).map((cue, index) => (cue.start - cues[index].end) * 1000);
    const failed = results.filter((item) => !item.passed);
    console.log(JSON.stringify({
      mode: 'read-only-db',
      snapshot_id: snapshotId,
      project_id: project.id,
      snapshot_segments: project.segments.length,
      audio_files_probed: results.length,
      two_tier_passed: results.length - failed.length,
      two_tier_failed: failed.length,
      failure_reasons: failed.reduce<Record<string, number>>((summary, item) => {
        summary[item.reason] = (summary[item.reason] ?? 0) + 1;
        return summary;
      }, {}),
      max_db_disk_duration_delta_ms: Math.round(Math.max(...results.map((item) => Number('duration_delta' in item ? item.duration_delta : 0))) * 1000),
      candidate_srt: candidateOutput,
      candidate_srt_cues: cues.length,
      max_cps: Number(Math.max(...cps).toFixed(2)),
      min_gap_ms: Number(Math.min(...gaps).toFixed(1)),
      candidate_pass: failed.length === 0 && Math.max(...cps) <= 20 && Math.min(...gaps) >= 80,
      failed_segments: failed,
    }, null, 2));
    if (failed.length || Math.max(...cps) > 20 || Math.min(...gaps) < 80) process.exitCode = 1;
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
