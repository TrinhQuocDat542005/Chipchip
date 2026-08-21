import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { DubbingProject, DubbingRenderConfig, DubbingSegment } from '../types';
import { resolveMediaUrl } from './assetStorage';
import { getTTSProvider } from './tts';

export const VOICE_CACHE_PIPELINE_VERSION = 'v4-smart-cache-sha256';
const LEGACY_PIPELINE_VERSION = 'v3-cadence-content';

export interface SegmentCacheInspection {
  segment: DubbingSegment;
  contentHash: string;
  hit: boolean;
  migrated: boolean;
  reason: string;
  filePath?: string;
  fileSizeBytes?: number;
}

function stableNumber(value: number) {
  return Number(value.toFixed(3));
}

function normalizedText(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function buildSegmentContentHash(project: DubbingProject, segment: DubbingSegment, config: DubbingRenderConfig) {
  const segmentIndex = project.segments.indexOf(segment);
  const nextEnabled = project.segments.slice(segmentIndex + 1).find((item) => item.enabled && item.translated_text.trim());
  const targetSlotDuration = Math.max(0.1, segment.end - segment.start);
  const renderWindowDuration = Math.max(targetSlotDuration, (nextEnabled?.start ?? segment.end) - segment.start);
  const voiceId = project.voice_profile && project.voice_profile !== 'default' ? project.voice_profile : 'default';
  const providerId = getTTSProvider(voiceId).id;
  const payload = {
    pipeline_version: VOICE_CACHE_PIPELINE_VERSION,
    translated_text: normalizedText(segment.translated_text),
    voice_id: voiceId,
    provider_id: providerId,
    target_language: project.target_language,
    target_slot_duration: stableNumber(targetSlotDuration),
    render_window_duration: stableNumber(renderWindowDuration),
    speed_cap: stableNumber(config.speed_cap),
    timing_mode: segment.voice_timing_mode ?? 'AUTO',
    manual_speed: segment.voice_timing_mode === 'MANUAL'
      ? stableNumber(Math.max(0.7, Math.min(1.8, segment.voice_speed ?? 1)))
      : null,
  };
  return createHash(config.cache_hash_algorithm).update(JSON.stringify(payload), 'utf8').digest('hex');
}

function legacySignatureMatches(project: DubbingProject, segment: DubbingSegment, config: DubbingRenderConfig) {
  if (config.speed_cap !== 1.18 || !segment.voice_signature) return false;
  const signature = `${LEGACY_PIPELINE_VERSION}|${segment.translated_text.trim()}|${segment.compressed_text ?? ''}|${project.voice_profile ?? 'default'}|${segment.voice_timing_mode ?? 'AUTO'}|${Math.max(.7, Math.min(1.8, segment.voice_speed ?? 1)).toFixed(2)}`;
  return segment.voice_signature === signature;
}

function cachedVoiceQualityFailure(segment: DubbingSegment) {
  if (!segment.voice_duration) return 'missing_voice_duration';
  const slotDuration = Math.max(0.1, segment.end - segment.start);
  const wordCount = normalizedText(segment.translated_text).split(/\s+/).filter(Boolean).length;
  if (segment.voice_duration > slotDuration * 1.05) {
    const overflowPct = (segment.voice_duration - slotDuration) / slotDuration * 100;
    if (overflowPct > 10) return 'two_tier_overflow';
  } else if (wordCount > 4 && wordCount / slotDuration > 4.2) {
    return 'two_tier_wps';
  }
  return undefined;
}

export async function inspectSegmentCache(
  project: DubbingProject,
  segment: DubbingSegment,
  config: DubbingRenderConfig,
): Promise<SegmentCacheInspection> {
  const contentHash = buildSegmentContentHash(project, segment, config);
  if (segment.voice_outdated) return { segment, contentHash, hit: false, migrated: false, reason: 'voice_outdated' };
  const migrated = !segment.voice_cache && legacySignatureMatches(project, segment, config);
  if (!migrated && segment.voice_cache?.content_hash !== contentHash) {
    return { segment, contentHash, hit: false, migrated: false, reason: 'content_hash_changed' };
  }
  if (!segment.voice_url || !segment.voice_duration) {
    return { segment, contentHash, hit: false, migrated: false, reason: 'missing_voice_metadata' };
  }
  const qualityFailure = cachedVoiceQualityFailure(segment);
  if (qualityFailure) return { segment, contentHash, hit: false, migrated: false, reason: qualityFailure };
  const filePath = resolveMediaUrl(segment.voice_url);
  if (!filePath) return { segment, contentHash, hit: false, migrated: false, reason: 'invalid_voice_path' };
  try {
    const file = await stat(filePath);
    if (!file.isFile() || file.size <= 44) return { segment, contentHash, hit: false, migrated: false, reason: 'empty_voice_file' };
    if (segment.voice_cache?.file_size_bytes && segment.voice_cache.file_size_bytes !== file.size) {
      return { segment, contentHash, hit: false, migrated: false, reason: 'voice_file_size_changed' };
    }
    return { segment, contentHash, hit: true, migrated, reason: migrated ? 'legacy_signature_migrated' : 'content_hash_match', filePath, fileSizeBytes: file.size };
  } catch {
    return { segment, contentHash, hit: false, migrated: false, reason: 'voice_file_missing' };
  }
}

export function applyCacheInspection(inspection: SegmentCacheInspection) {
  if (!inspection.hit || !inspection.fileSizeBytes) return;
  const now = new Date().toISOString();
  const segment = inspection.segment;
  segment.voice_cache = {
    content_hash: inspection.contentHash,
    hash_algorithm: 'sha256',
    pipeline_version: VOICE_CACHE_PIPELINE_VERSION,
    file_size_bytes: inspection.fileSizeBytes,
    duration_seconds: segment.voice_duration ?? 0,
    created_at: segment.voice_cache?.created_at ?? now,
    last_verified_at: now,
  };
  segment.voice_signature = inspection.contentHash;
  segment.voice_outdated = false;
}

export async function markSegmentCacheRendered(
  project: DubbingProject,
  segment: DubbingSegment,
  config: DubbingRenderConfig,
  contentHash = buildSegmentContentHash(project, segment, config),
) {
  if (!segment.voice_url || !segment.voice_duration) throw new Error(`Segment ${segment.id} has no rendered voice metadata`);
  const filePath = resolveMediaUrl(segment.voice_url);
  if (!filePath) throw new Error(`Segment ${segment.id} has an invalid rendered voice path`);
  const file = await stat(filePath);
  const now = new Date().toISOString();
  segment.voice_cache = {
    content_hash: contentHash,
    hash_algorithm: 'sha256',
    pipeline_version: VOICE_CACHE_PIPELINE_VERSION,
    file_size_bytes: file.size,
    duration_seconds: segment.voice_duration,
    created_at: now,
    last_verified_at: now,
  };
  segment.voice_signature = contentHash;
  segment.voice_outdated = false;
  return segment.voice_cache;
}
