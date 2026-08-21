import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DubbingProject } from '../src/types';
import { resolveMediaUrl } from '../src/services/assetStorage';
import { buildReadableSrt } from '../src/services/dubbingService';
import { probeMedia } from '../src/services/mediaProbeService';
import { mapWithConcurrency, resolveDubbingRenderConfig } from '../src/services/renderRuntime';
import { markSegmentCacheRendered } from '../src/services/segmentCacheService';

const projectId = process.argv[2] || 'dub-1786898959225';
const snapshotId = process.argv[3] || 'snap-1787298119214-0w7el';
const databasePath = path.resolve(process.env.VIDEO_FACTORY_DB_PATH || path.join('data', 'video-factory.db'));

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function prepareRestoredProject(snapshotProject: DubbingProject) {
  if (snapshotProject.id !== projectId) {
    throw new Error(`Snapshot project mismatch: expected ${projectId}, got ${snapshotProject.id}`);
  }
  if (!snapshotProject.segments.length) throw new Error('Refusing to restore an empty snapshot');

  const restored = structuredClone(snapshotProject);
  const config = resolveDubbingRenderConfig(restored);
  restored.render_config = config;

  const probes = await mapWithConcurrency(restored.segments, 6, async (segment) => {
    if (!segment.voice_url) throw new Error(`Segment ${segment.id} has no voice_url`);
    const filePath = resolveMediaUrl(segment.voice_url);
    if (!filePath) throw new Error(`Segment ${segment.id} has an invalid voice_url`);
    const media = await probeMedia(filePath);
    const actualDuration = media.audio?.duration ?? media.duration;
    if (!Number.isFinite(actualDuration) || actualDuration <= 0) {
      throw new Error(`Segment ${segment.id} has invalid physical duration: ${actualDuration}`);
    }
    const slotDuration = Math.max(0.1, segment.end - segment.start);
    const overflow = Math.max(0, actualDuration - slotDuration);
    segment.voice_duration = actualDuration;
    segment.voice_overflow = overflow;
    segment.voice_words_per_second = countWords(segment.translated_text) / Math.max(0.25, actualDuration);
    segment.voice_outdated = false;
    segment.timing_quality = overflow > 0.08 ? 'NEEDS_REVIEW' : Math.abs((segment.voice_speed ?? 1) - 1) > 0.12 ? 'ADJUSTED' : 'NATURAL';
    return { segment, actualDuration, slotDuration };
  });

  await mapWithConcurrency(restored.segments, 6, (segment) => markSegmentCacheRendered(restored, segment, config));
  restored.status = 'COMPLETED';
  restored.progress = 100;
  restored.error_message = undefined;
  restored.updated_at = new Date().toISOString();

  const failures = probes.filter(({ actualDuration, slotDuration }) =>
    actualDuration > slotDuration * 1.05 && (actualDuration - slotDuration) / slotDuration * 100 > 10,
  );
  if (failures.length) {
    throw new Error(`Prepared snapshot failed overflow validation for ${failures.length} segment(s)`);
  }
  return restored;
}

async function replaceSrtAtomically(project: DubbingProject) {
  const directory = path.resolve('storage', project.id, 'dub-work');
  const target = path.join(directory, 'translated.srt');
  const temporary = path.join(directory, `.translated.srt.${process.pid}.${Date.now()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, buildReadableSrt(project.segments.filter((segment) => segment.enabled)), { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return target;
}

async function main() {
  const database = new DatabaseSync(databasePath);
  let originalProject: DubbingProject | undefined;
  let restoredProject: DubbingProject | undefined;
  let databaseCommitted = false;
  try {
    const currentRow = database.prepare('SELECT data FROM dubbing_projects WHERE id=?').get(projectId) as { data: string } | undefined;
    const snapshotRow = database.prepare('SELECT data FROM project_snapshots WHERE id=? AND project_id=?').get(snapshotId, projectId) as { data: string } | undefined;
    if (!currentRow) throw new Error(`Live project not found: ${projectId}`);
    if (!snapshotRow) throw new Error(`Snapshot not found: ${snapshotId}`);
    originalProject = JSON.parse(currentRow.data) as DubbingProject;
    restoredProject = await prepareRestoredProject(JSON.parse(snapshotRow.data) as DubbingProject);

    const now = new Date().toISOString();
    const recoverySnapshotId = `snap-recovery-${Date.now()}-${randomUUID().slice(0, 8)}`;
    database.exec('BEGIN IMMEDIATE');
    try {
      database.prepare(
        'INSERT INTO project_snapshots (id, project_id, name, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        recoverySnapshotId,
        projectId,
        `Recovery backup before restoring ${snapshotId}`,
        'MANUAL',
        JSON.stringify(originalProject),
        now,
      );
      database.prepare('UPDATE dubbing_projects SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(restoredProject), now, projectId);
      database.exec('COMMIT');
      databaseCommitted = true;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve the original transaction error. */ }
      throw error;
    }

    try {
      const srtPath = await replaceSrtAtomically(restoredProject);
      const maxDurationDeltaMs = Math.max(...restoredProject.segments.map((segment) =>
        Math.abs((segment.voice_duration ?? 0) - (segment.voice_cache?.duration_seconds ?? 0)) * 1000,
      ));
      console.log(JSON.stringify({
        restored: true,
        project_id: projectId,
        source_snapshot_id: snapshotId,
        rollback_snapshot_id: recoverySnapshotId,
        previous_segments: originalProject.segments.length,
        restored_segments: restoredProject.segments.length,
        cache_v4_segments: restoredProject.segments.filter((segment) => segment.voice_cache?.pipeline_version === 'v4-smart-cache-sha256').length,
        max_db_cache_duration_delta_ms: Number(maxDurationDeltaMs.toFixed(3)),
        translated_srt: srtPath,
      }, null, 2));
    } catch (error) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const rollbackAt = new Date().toISOString();
        database.prepare('UPDATE dubbing_projects SET data=?, updated_at=? WHERE id=?').run(JSON.stringify(originalProject), rollbackAt, projectId);
        database.exec('COMMIT');
        databaseCommitted = false;
      } catch (rollbackError) {
        try { database.exec('ROLLBACK'); } catch { /* Best effort only. */ }
        throw new AggregateError([error, rollbackError], 'SRT replacement and automatic DB rollback both failed');
      }
      throw new Error(`SRT replacement failed; live DB project was rolled back: ${(error as Error).message}`);
    }
  } finally {
    database.close();
  }
  if (!databaseCommitted) throw new Error('Restore did not commit');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
