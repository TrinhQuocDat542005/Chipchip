export type ProjectStatus =
  | 'DRAFT'
  | 'SCRIPT_GENERATING'
  | 'SCRIPT_READY'
  | 'IMAGES_GENERATING'
  | 'IMAGES_READY'
  | 'VIDEOS_GENERATING'
  | 'VIDEOS_READY'
  | 'VOICE_GENERATING'
  | 'VOICE_READY'
  | 'RENDERING'
  | 'REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export type SceneAssetStatus = 'PENDING' | 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED';

export type AspectRatio = '9:16' | '16:9' | '1:1';

export type PlatformType = 'TikTok / Shorts (9:16)' | 'YouTube (16:9)' | 'Instagram Square (1:1)';

export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  duration: number; // in seconds
  narration: string;
  subtitle: string;
  visual_description: string;
  image_prompt: string;
  video_prompt: string;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  image_status: SceneAssetStatus;
  video_status: SceneAssetStatus;
  audio_status: SceneAssetStatus;
  motion_intensity: 'Low' | 'Medium' | 'High';
  camera_movement: 'Pan Up (Ascend)' | 'Zoom In' | 'Pan Left' | 'Static' | 'Dynamic Track';
  error_message?: string;
}

export interface VisualStyleProfile {
  id: string;
  name: string;
  art_style: string;
  color_mood: string;
  lighting: string;
  camera_style: string;
  character_description: string;
  negative_prompt: string;
  preview_url: string;
}

export interface VideoProject {
  id: string;
  title: string;
  topic: string;
  platform: PlatformType;
  duration: '30 seconds' | '60 seconds' | '90 seconds';
  language: string;
  tone: string;
  aspect_ratio: AspectRatio;
  status: ProjectStatus;
  progress: number; // 0 to 100
  status_message?: string;
  visual_style_id: string;
  visual_style?: VisualStyleProfile;
  hook?: string;
  narration_body?: string;
  call_to_action?: string;
  caption?: string;
  hashtags?: string[];
  final_video_url?: string;
  bg_music_url?: string;
  bg_music_name?: string;
  bg_music_volume?: number;
  created_at: string;
  updated_at: string;
  scenes?: Scene[];
}

export interface GenerationJob {
  id: string;
  project_id: string;
  scene_id?: string;
  type:
    | 'GENERATE_SCRIPT'
    | 'GENERATE_IMAGE'
    | 'GENERATE_ALL_IMAGES'
    | 'GENERATE_VIDEO'
    | 'GENERATE_ALL_VIDEOS'
    | 'GENERATE_VOICE'
    | 'GENERATE_SUBTITLES'
    | 'RENDER_FINAL'
    | 'RUN_AUTOMATION'
    | 'PUBLISH_SOCIAL'
    | 'DUB_TRANSCRIBE'
    | 'DUB_RENDER';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  error_message?: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at?: string;
  payload?: Record<string, unknown>;
  started_at: string;
  completed_at?: string;
}

export interface MediaAsset {
  id: string;
  project_id: string;
  scene_id?: string;
  type: 'IMAGE' | 'VIDEO_CLIP' | 'VOICE' | 'MUSIC' | 'SUBTITLE' | 'FINAL_VIDEO' | 'REFERENCE_IMAGE';
  url: string;
  mime_type: string;
  provider: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ProviderConfig {
  id: string;
  category: 'LLM' | 'Image' | 'Video' | 'TTS';
  name: string;
  model: string;
  status: 'Configured' | 'Not Configured' | 'Unavailable' | 'Active';
  masked_key: string;
  usage_info?: string;
  tokens_used?: number;
  tokens_limit?: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  niche: string;
  frequency: 'Daily' | 'Twice Weekly' | 'Weekly';
  language: string;
  duration: '30 seconds' | '60 seconds' | '90 seconds';
  content_style: string;
  auto_script: boolean;
  auto_image: boolean;
  auto_video: boolean;
  auto_voice: boolean;
  auto_render: boolean;
  require_review: boolean;
  status: 'Active' | 'Paused';
  topic_template?: string;
  platform?: PlatformType;
  tone?: string;
  visual_style_id?: string;
  timezone?: string;
  run_at?: string;
  days_of_week?: number[];
  monthly_budget_usd?: number;
  last_run?: string;
  next_run?: string;
  last_project_id?: string;
  last_error?: string;
}

export interface UsageRecord {
  id: string;
  project_id?: string;
  job_id?: string;
  provider: string;
  operation: string;
  units: number;
  unit_name: string;
  estimated_cost_usd: number;
  created_at: string;
}

export interface Publication {
  id: string;
  project_id: string;
  platform: 'TikTok' | 'YouTube' | 'Instagram' | 'Export Package';
  status: 'PENDING' | 'PUBLISHED' | 'FAILED' | 'PACKAGE_READY';
  external_id?: string;
  external_url?: string;
  package_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface UsageSummary {
  month: string;
  total_cost_usd: number;
  monthly_budget_usd: number;
  remaining_usd: number;
  percent_used: number;
  by_provider: Record<string, number>;
  records: UsageRecord[];
}

export interface CharacterProfile {
  id: string;
  name: string;
  speaker_id?: string; // e.g. SPEAKER_00, SPEAKER_01
  gender: 'MALE' | 'FEMALE' | 'CHILD' | 'NEUTRAL';
  age_group?: string;
  voice_speed?: number;
  voice_pitch?: number;
  description?: string;
}

export interface ProjectSnapshot {
  id: string;
  project_id: string;
  name: string;
  snapshot_type: 'MANUAL' | 'PRE_ASR' | 'PRE_TRANSLATE' | 'PRE_VOICEGEN';
  data: DubbingProject;
  created_at: string;
}

export interface DubbingRenderConfig {
  segment_concurrency: number;
  ffmpeg_concurrency: number;
  tts_max_attempts: number;
  retry_base_delay_ms: number;
  retry_max_delay_ms: number;
  speed_cap: number;
  cache_hash_algorithm: 'sha256';
}

export interface SegmentVoiceCacheMetadata {
  content_hash: string;
  hash_algorithm: 'sha256';
  pipeline_version: string;
  file_size_bytes: number;
  duration_seconds: number;
  created_at: string;
  last_verified_at: string;
}

export interface DubbingSegment {
  id: string;
  start: number;
  end: number;
  source_text: string;
  translated_text: string;
  speaker?: string;
  character_id?: string;
  voice_url?: string;
  enabled: boolean;
  voice_delay_ms?: number;
  voice_start?: number;
  voice_speed?: number;
  voice_timing_mode?: 'AUTO' | 'MANUAL';
  voice_duration?: number;
  voice_overflow?: number;
  voice_timeline_shift?: number;
  voice_words_per_second?: number;
  timing_quality?: 'NATURAL' | 'ADJUSTED' | 'NEEDS_REVIEW';
  voice_signature?: string;
  voice_outdated?: boolean;
  voice_freeze_frame_ms?: number;
  compressed_text?: string;
  reviewed?: boolean;
  voice_cache?: SegmentVoiceCacheMetadata;
}

export interface DubbingProject {
  id: string;
  title: string;
  source_video_url: string;
  source_language: string;
  target_language: string;
  mode: 'SUBTITLES' | 'VOICEOVER' | 'DUB';
  status: 'UPLOADED' | 'TRANSCRIBING' | 'TRANSCRIPT_READY' | 'GENERATING_VOICE' | 'RENDERING' | 'COMPLETED' | 'FAILED';
  progress: number;
  duration: number;
  original_audio_volume: number;
  voice_volume: number;
  voice_profile?: 'default' | 'co-gai-hoat-ngon' | 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural' | 'zh-CN-XiaoxiaoNeural' | string;
  keep_original_bgm?: boolean;
  burn_subtitles: boolean;
  subtitle_position: number;
  blur_source_text?: boolean;
  source_text_blur_x?: number;
  source_text_blur_y?: number;
  source_text_blur_width?: number;
  source_text_blur_height?: number;
  source_text_blur_strength?: number;
  blur_source_logo?: boolean;
  source_logo_blur_x?: number;
  source_logo_blur_y?: number;
  source_logo_blur_width?: number;
  source_logo_blur_height?: number;
  source_logo_blur_strength?: number;
  voice_delay_ms: number;
  series_name?: string;
  episode_number?: number;
  story_summary?: string;
  story_context?: string;
  story_analyzed_at?: string;
  parent_project_id?: string;
  part_number?: number;
  part_count?: number;
  source_start_offset?: number;
  asr_engine?: 'whisperx' | 'faster-whisper';
  alignment_warning?: string;
  render_warning?: string;
  hf_token?: string;
  glossary?: string;
  characters?: CharacterProfile[];
  render_config?: DubbingRenderConfig;
  segments: DubbingSegment[];
  output_video_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface ScriptGenInput {
  topic: string;
  platform: PlatformType;
  duration: '30 seconds' | '60 seconds' | '90 seconds';
  language: string;
  tone: string;
  visual_style_name: string;
}

export interface ScriptPlanOutput {
  title: string;
  hook: string;
  narration_body: string;
  call_to_action: string;
  estimated_duration_seconds: number;
  caption: string;
  hashtags: string[];
  scenes: {
    scene_number: number;
    duration: number;
    narration: string;
    subtitle: string;
    visual_description: string;
    image_prompt: string;
    video_prompt: string;
  }[];
}
