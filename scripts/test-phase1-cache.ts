import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DubbingProject, DubbingSegment } from '../src/types';
import { buildSegmentContentHash, inspectSegmentCache, markSegmentCacheRendered } from '../src/services/segmentCacheService';
import { mapWithConcurrency, resolveDubbingRenderConfig, withKeyedLock } from '../src/services/renderRuntime';
import { withExponentialBackoff } from '../src/services/retryPolicy';
import { saveProjectAsset } from '../src/services/assetStorage';

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ai-video-factory-cache-'));
  process.env.ASSET_ROOT = temporaryRoot;
  const projectId = 'phase1-cache-test';
  const projectDirectory = path.join(temporaryRoot, projectId);
  await mkdir(projectDirectory, { recursive: true });

  const now = new Date().toISOString();
  const segments: DubbingSegment[] = Array.from({ length: 100 }, (_, index) => ({
    id: `seg-${index + 1}`,
    start: index * 2,
    end: index * 2 + 1.5,
    source_text: `源文本 ${index + 1}`,
    translated_text: `Câu thoại thử nghiệm số ${index + 1}.`,
    enabled: true,
    voice_start: index * 2,
    voice_speed: 1,
    voice_timing_mode: 'AUTO',
    voice_duration: 1.4,
    voice_outdated: false,
  }));
  const project: DubbingProject = {
    id: projectId,
    title: 'Phase 1 cache fixture',
    source_video_url: `/media/${projectId}/source.mp4`,
    source_language: 'zh',
    target_language: 'vi',
    mode: 'DUB',
    status: 'TRANSCRIPT_READY',
    progress: 0,
    duration: 200,
    original_audio_volume: .25,
    voice_volume: 1,
    voice_profile: 'co-gai-hoat-ngon',
    burn_subtitles: true,
    subtitle_position: 78,
    voice_delay_ms: 50,
    segments,
    created_at: now,
    updated_at: now,
  };
  const config = resolveDubbingRenderConfig(project);

  try {
    for (const segment of segments) {
      const fileName = `${segment.id}.wav`;
      await writeFile(path.join(projectDirectory, fileName), Buffer.alloc(256, 1));
      segment.voice_url = `/media/${projectId}/${fileName}`;
      await markSegmentCacheRendered(project, segment, config);
    }

    const baseline = await mapWithConcurrency(segments, 8, (segment) => inspectSegmentCache(project, segment, config));
    assert.equal(baseline.filter((item) => item.hit).length, 100, 'Baseline must reuse all cached segments');

    const changed = segments[42];
    const previousHash = buildSegmentContentHash(project, changed, config);
    changed.translated_text = 'Một câu duy nhất đã được chỉnh sửa.';
    const startedAt = performance.now();
    const plan = await mapWithConcurrency(segments, 8, (segment) => inspectSegmentCache(project, segment, config));
    const misses = plan.filter((item) => !item.hit);
    let rendered = 0;
    await mapWithConcurrency(misses, config.segment_concurrency, async () => {
      rendered += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const elapsedMs = performance.now() - startedAt;
    assert.equal(misses.length, 1, 'Editing one segment must invalidate exactly one cache entry');
    assert.equal(misses[0].segment.id, changed.id);
    assert.equal(rendered, 1, 'Worker pool must render only the changed segment');
    assert.notEqual(buildSegmentContentHash(project, changed, config), previousHash);
    assert.ok(elapsedMs < 2_000, `Diff planning and dispatch took ${elapsedMs.toFixed(1)}ms`);

    const saferSpeedConfig = { ...config, speed_cap: 1.17 };
    const speedInvalidation = await inspectSegmentCache(project, segments[0], saferSpeedConfig);
    assert.equal(speedInvalidation.hit, false, 'Changing speed cap must invalidate the segment hash');

    await rm(path.join(projectDirectory, 'seg-1.wav'), { force: true });
    const missingFile = await inspectSegmentCache(project, segments[0], config);
    assert.equal(missingFile.hit, false, 'A missing WAV must never be treated as a cache hit');

    const invalidQualitySegment = segments[1];
    invalidQualitySegment.voice_duration = 3;
    const invalidQuality = await inspectSegmentCache(project, invalidQualitySegment, config);
    assert.equal(invalidQuality.hit, false, 'Two-Tier overflow must invalidate an otherwise matching cache entry');
    assert.equal(invalidQuality.reason, 'two_tier_overflow');

    let attempts = 0;
    const retryResult = await withExponentialBackoff(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('temporary TTS network failure');
      return 'ok';
    }, { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 });
    assert.equal(retryResult, 'ok');
    assert.equal(attempts, 3);

    let activeForKey = 0;
    let maxActiveForKey = 0;
    await Promise.all([1, 2, 3].map(() => withKeyedLock('same-project:same-segment', async () => {
      activeForKey += 1;
      maxActiveForKey = Math.max(maxActiveForKey, activeForKey);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeForKey -= 1;
    })));
    assert.equal(maxActiveForKey, 1, 'Concurrent requests for one segment must be serialized');

    const atomicAssetUrl = await saveProjectAsset(projectId, 'atomic-write.bin', Buffer.from('first'));
    await saveProjectAsset(projectId, 'atomic-write.bin', Buffer.from('second'));
    assert.equal(atomicAssetUrl, `/media/${projectId}/atomic-write.bin`);
    assert.equal((await readFile(path.join(projectDirectory, 'atomic-write.bin'), 'utf8')), 'second');
    assert.equal((await readdir(projectDirectory)).filter((name) => name.endsWith('.tmp')).length, 0);

    process.env.VIDEO_FACTORY_DB_PATH = path.join(temporaryRoot, 'phase1-test.db');
    const { projectStore } = await import('../src/services/projectStore');
    const { jobQueue } = await import('../src/services/jobQueue');
    projectStore.saveDubbingProject(project);
    const enqueueStartedAt = performance.now();
    const previewJob = jobQueue.enqueue({ projectId: project.id, sceneId: changed.id, type: 'DUB_SEGMENT_PREVIEW', maxAttempts: 1 });
    const enqueueDurationMs = performance.now() - enqueueStartedAt;
    assert.ok(enqueueDurationMs < 2_000, `Preview job enqueue took ${enqueueDurationMs.toFixed(1)}ms`);
    assert.equal(previewJob.status, 'PENDING');
    assert.equal(previewJob.scene_id, changed.id);
    const { DatabaseSync } = await import('node:sqlite');
    const verificationDatabase = new DatabaseSync(process.env.VIDEO_FACTORY_DB_PATH, { readOnly: true });
    const storedRow = verificationDatabase.prepare('SELECT data FROM dubbing_projects WHERE id=?').get(project.id) as { data: string };
    const storedProject = JSON.parse(storedRow.data) as DubbingProject;
    verificationDatabase.close();
    assert.equal(storedProject.segments.length, 100, 'Atomic project save must preserve every segment');
    projectStore.close();

    console.log(JSON.stringify({
      fixture_segments: segments.length,
      baseline_cache_hits: baseline.filter((item) => item.hit).length,
      edited_segments: 1,
      cache_misses_after_edit: misses.length,
      worker_render_count: rendered,
      diff_plan_and_dispatch_ms: Number(elapsedMs.toFixed(2)),
      under_2_seconds: elapsedMs < 2_000,
      speed_cap_invalidation: 'PASS',
      missing_file_invalidation: 'PASS',
      two_tier_cache_quality_gate: 'PASS',
      exponential_retry_attempts: attempts,
      same_segment_race_max_concurrency: maxActiveForKey,
      atomic_asset_replace: 'PASS',
      atomic_db_segment_count: storedProject.segments.length,
      preview_job_enqueue_ms: Number(enqueueDurationMs.toFixed(2)),
      preview_job_status: previewJob.status,
      all_pass: true,
    }, null, 2));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
