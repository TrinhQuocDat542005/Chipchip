import { DatabaseSync } from 'node:sqlite';
import { stat } from 'node:fs/promises';
import { DubbingProject } from '../src/types';
import { generateSegmentPreview, renderDub } from '../src/services/dubbingService';
import { resolveMediaUrl } from '../src/services/assetStorage';
import { inspectSegmentCache } from '../src/services/segmentCacheService';
import { mapWithConcurrency, resolveDubbingRenderConfig } from '../src/services/renderRuntime';
import { projectStore } from '../src/services/projectStore';

const projectId = process.argv[2] || 'dub-1786898959225';
const segmentId = process.argv[3] || 'seg-29';
const previewOnly = process.argv.includes('--preview-only');
const databasePath = process.env.VIDEO_FACTORY_DB_PATH || 'data/video-factory.db';

async function inspect(project: DubbingProject) {
  const config = resolveDubbingRenderConfig(project);
  return mapWithConcurrency(project.segments, 8, (segment) => inspectSegmentCache(project, segment, config));
}

async function main() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const row = database.prepare('SELECT data FROM dubbing_projects WHERE id=?').get(projectId) as { data: string } | undefined;
  database.close();
  if (!row) throw new Error(`Project not found: ${projectId}`);

  const originalSerialized = row.data;
  const original = JSON.parse(originalSerialized) as DubbingProject;
  const baseline = await inspect(original);
  if (baseline.some((item) => !item.hit)) {
    throw new Error(`Live baseline is not fully cached: ${baseline.filter((item) => !item.hit).length} miss(es)`);
  }

  const testProject = structuredClone(original);
  testProject.id = `phase1-real-diff-${projectId}`;
  testProject.title = `[Phase 1 real diff audit] ${original.title}`;
  const edited = testProject.segments.find((segment) => segment.id === segmentId);
  if (!edited) throw new Error(`Segment not found: ${segmentId}`);
  const originalText = edited.translated_text;
  edited.translated_text = /à\?$/.test(originalText)
    ? originalText.replace(/à\?$/, 'thật à?')
    : `${originalText.replace(/[.!?…]+$/, '')} nhé.`;
  edited.voice_outdated = false;

  const before = await inspect(testProject);
  const beforeHits = before.filter((item) => item.hit);
  const beforeMisses = before.filter((item) => !item.hit);
  if (beforeHits.length !== testProject.segments.length - 1 || beforeMisses.length !== 1 || beforeMisses[0].segment.id !== segmentId) {
    throw new Error(`Expected exactly one miss for ${segmentId}; got hits=${beforeHits.length}, misses=${beforeMisses.map((item) => item.segment.id).join(',')}`);
  }

  const startedAt = performance.now();
  let changedSegmentFinishedAt: number | undefined;
  const outputUrl = previewOnly
    ? (await generateSegmentPreview(testProject, edited, testProject.segments.indexOf(edited) + 1), edited.voice_url)
    : await renderDub(testProject, (progress) => {
      if (progress >= 65 && changedSegmentFinishedAt === undefined) changedSegmentFinishedAt = performance.now();
    });
  const finishedAt = performance.now();
  if (previewOnly) changedSegmentFinishedAt = finishedAt;
  const after = await inspect(testProject);
  const outputPath = resolveMediaUrl(outputUrl);
  if (!outputPath) throw new Error(`Invalid render output URL: ${outputUrl}`);
  const outputFile = await stat(outputPath);

  const verifyDatabase = new DatabaseSync(databasePath, { readOnly: true });
  const afterRow = verifyDatabase.prepare('SELECT data FROM dubbing_projects WHERE id=?').get(projectId) as { data: string } | undefined;
  verifyDatabase.close();
  const databaseUnchanged = afterRow?.data === originalSerialized;
  const segmentRenderMs = (changedSegmentFinishedAt ?? finishedAt) - startedAt;
  const totalRenderMs = finishedAt - startedAt;
  const functionalPass = beforeMisses.length === 1 && after.every((item) => item.hit) && outputFile.size > 0 && databaseUnchanged;
  const performanceTargetPass = segmentRenderMs < 2_000;
  const result = {
    source_project_id: projectId,
    test_project_id: testProject.id,
    edited_segment_id: segmentId,
    original_text: originalText,
    edited_text: edited.translated_text,
    mode: previewOnly ? 'segment-preview' : 'full-video',
    before_cache_hits: beforeHits.length,
    before_cache_misses: beforeMisses.length,
    changed_segment_render_ms: Number(segmentRenderMs.toFixed(2)),
    changed_segment_under_2_seconds: segmentRenderMs < 2_000,
    full_video_render_ms: previewOnly ? null : Number(totalRenderMs.toFixed(2)),
    after_cache_hits: after.filter((item) => item.hit).length,
    after_cache_misses: after.filter((item) => !item.hit).length,
    output_file_bytes: outputFile.size,
    live_database_unchanged: databaseUnchanged,
    functional_pass: functionalPass,
    performance_target_pass: performanceTargetPass,
    all_pass: functionalPass && performanceTargetPass,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.all_pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => projectStore.close());
