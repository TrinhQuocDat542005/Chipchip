import { DatabaseSync } from 'node:sqlite';
import { DubbingProject } from '../src/types';
import { inspectSegmentCache } from '../src/services/segmentCacheService';
import { mapWithConcurrency, resolveDubbingRenderConfig } from '../src/services/renderRuntime';

const projectIds = [
  'dub-1786900777961',
  'dub-1786897570201',
  'dub-1786899653642',
  'dub-1786898959225',
  'dub-1786732340533-part-01',
];

async function main() {
  const database = new DatabaseSync('data/video-factory.db', { readOnly: true });
  try {
    const breakdown: Array<Record<string, unknown>> = [];
    let total = 0;
    let hits = 0;
    let misses = 0;
    for (const projectId of projectIds) {
      const row = database.prepare('SELECT data FROM dubbing_projects WHERE id=?').get(projectId) as { data: string } | undefined;
      if (!row) {
        breakdown.push({ project_id: projectId, error: 'missing_project' });
        continue;
      }
      const project = JSON.parse(row.data) as DubbingProject;
      const config = resolveDubbingRenderConfig(project);
      const inspections = await mapWithConcurrency(project.segments, 8, (segment) => inspectSegmentCache(project, segment, config));
      const projectHits = inspections.filter((item) => item.hit).length;
      const projectMisses = inspections.length - projectHits;
      total += inspections.length;
      hits += projectHits;
      misses += projectMisses;
      const reasons = inspections.filter((item) => !item.hit).reduce<Record<string, number>>((result, item) => {
        result[item.reason] = (result[item.reason] ?? 0) + 1;
        return result;
      }, {});
      breakdown.push({ project_id: projectId, segments: inspections.length, reusable: projectHits, rerender_required: projectMisses, miss_reasons: reasons });
    }
    console.log(JSON.stringify({
      database_mode: 'read-only',
      total_segments: total,
      reusable_segments: hits,
      rerender_required: misses,
      reuse_rate_pct: total ? Number((hits / total * 100).toFixed(2)) : 0,
      project_breakdown: breakdown,
    }, null, 2));
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
