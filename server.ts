import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { unlink, readFile, rm } from 'fs/promises';
import { createServer as createViteServer } from 'vite';
import { projectStore } from './src/services/projectStore';
import { generateScriptWithGemini } from './src/services/geminiService';
import { generateSceneImage } from './src/services/imageService';
import { generateNarrationAudio } from './src/services/ttsService';
import { getStorageRoot, resolveMediaUrl, saveProjectAsset } from './src/services/assetStorage';
import { getTTSProvider, setTTSProvider } from './src/services/tts';
import { renderProjectVideo } from './src/services/renderService';
import { probeMedia } from './src/services/mediaProbeService';
import { jobQueue, NonRetryableJobError } from './src/services/jobQueue';
import { getVideoProvider, setVideoProvider } from './src/services/video';
import { getImageProvider, setImageProvider } from './src/services/image';
import { DEFAULT_STYLE_PRESETS } from './src/data/stylePresets';
import { VideoProject, Scene, GenerationJob, MediaAsset, DubbingProject } from './src/types';
import { AutomationScheduler } from './src/services/automationScheduler';
import { assertBudgetAvailable, getUsageSummary, recordUsage } from './src/services/usageService';
import { publishProject } from './src/services/publishingService';
import { analyzeStoryContext, generateSegmentPreview, isInvalidTranslationSegment, renderDub, repairBrokenTranslationSegments, splitOverlongSegments, transcribeVideo, translateMissingTranscript, translateTranscript } from './src/services/dubbingService';
import { analyzeSafeSplitPoints, splitVideoIntoFiles } from './src/services/videoSplitService';

const activeDubRenders = new Set<string>();

dotenv.config({ path: ['.env.local', '.env'] });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // UTF-8 Validation Middleware to reject replacement characters (\uFFFD)
  app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      const raw = JSON.stringify(req.body);
      if (raw.includes('\uFFFD')) {
        return res.status(400).json({ error: 'Dữ liệu chứa ký tự không hợp lệ (UTF-8 encoding error). Vui lòng gửi dữ liệu UTF-8 chuẩn.' });
      }
    }
    next();
  });

  // Persist an explicitly configured HF token without shipping credentials in source.
  const configuredHfToken = process.env.HF_TOKEN?.trim();
  if (configuredHfToken && !projectStore.getSetting('hf_token')) {
    projectStore.setSetting('hf_token', configuredHfToken);
  }
  const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => callback(null, file.mimetype === 'video/mp4'),
  });
  const musicUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => callback(null, ['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(file.mimetype)),
  });
  const dubbingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.MAX_DUB_UPLOAD_MB || 500) * 1024 * 1024, files: 1 }, fileFilter: (_req,file,cb)=>cb(null,file.mimetype==='video/mp4') });
  app.use('/media', express.static(getStorageRoot(), {
    fallthrough: false,
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  }));

  setImageProvider(projectStore.getSetting('image_provider') || process.env.IMAGE_PROVIDER || 'placeholder');
  setVideoProvider(projectStore.getSetting('video_provider') || process.env.VIDEO_PROVIDER || 'local-motion');
  setTTSProvider(projectStore.getSetting('tts_provider') || process.env.TTS_PROVIDER || 'vieneu');

  registerJobHandlers();
  jobQueue.start();
  const scheduler = new AutomationScheduler((rule) => {
    try {
      assertBudgetAvailable();
      const style = DEFAULT_STYLE_PRESETS.find(item => item.id === rule.visual_style_id) || DEFAULT_STYLE_PRESETS[0];
      const project: VideoProject = {
        id: `proj-auto-${Date.now()}`, title: rule.name, topic: (rule.topic_template || rule.niche).replace('{date}', new Date().toLocaleDateString('vi-VN')),
        platform: rule.platform || 'TikTok / Shorts (9:16)', duration: rule.duration, language: rule.language,
        tone: rule.tone || rule.content_style, aspect_ratio: rule.platform?.includes('16:9') ? '16:9' : rule.platform?.includes('1:1') ? '1:1' : '9:16',
        status: 'DRAFT', progress: 0, visual_style_id: style.id, visual_style: style,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status_message: `Created by automation: ${rule.name}`,
      };
      projectStore.saveProject(project); rule.last_project_id = project.id; rule.last_error = undefined; projectStore.saveAutomation(rule);
      jobQueue.enqueue({ projectId: project.id, type: 'RUN_AUTOMATION', payload: { ruleId: rule.id }, maxAttempts: 1 });
    } catch (error) { rule.last_error = (error as Error).message; projectStore.saveAutomation(rule); }
  });
  scheduler.start();

  // --- API ROUTES ---

  // 1. Projects List & Filter
  app.get('/api/projects', (req, res) => {
    try {
      const projects = projectStore.getAllProjects();
      res.json(projects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Create Project from Idea Topic
  app.post('/api/projects', (req, res) => {
    try {
      const { topic, platform, duration, language, tone, visual_style_id } = req.body;

      const styleObj = DEFAULT_STYLE_PRESETS.find((s) => s.id === visual_style_id) || DEFAULT_STYLE_PRESETS[0];

      const newProject: VideoProject = {
        id: 'proj-' + Date.now(),
        title: topic && topic.length > 30 ? topic.substring(0, 28) + '...' : topic || 'Untitled Project',
        topic: topic || 'Custom Topic Idea',
        platform: platform || 'TikTok / Shorts (9:16)',
        duration: duration || '60 seconds',
        language: language || 'English (US)',
        tone: tone || 'Cinematic / Mysterious',
        aspect_ratio: platform?.includes('16:9') ? '16:9' : platform?.includes('1:1') ? '1:1' : '9:16',
        status: 'DRAFT',
        progress: 0,
        status_message: 'Project created from topic idea',
        visual_style_id: styleObj.id,
        visual_style: styleObj,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      projectStore.saveProject(newProject);
      res.json(newProject);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get Project Detail
  app.get('/api/projects/:id', (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  });

  // 4. Update Project Fields
  app.patch('/api/projects/:id', (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    Object.assign(project, req.body);
    projectStore.saveProject(project);
    res.json(project);
  });

  // 5. Delete Project
  app.delete('/api/projects/:id', (req, res) => {
    const deleted = projectStore.deleteProject(req.params.id);
    res.json({ success: deleted });
  });

  // 6. Generate Script (AI)
  app.post('/api/projects/:id/generate-script', async (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (req.query.queue === 'true') {
      return res.status(202).json({ job: jobQueue.enqueue({ projectId: project.id, type: 'GENERATE_SCRIPT' }) });
    }

    project.status = 'SCRIPT_GENERATING';
    project.progress = 15;
    project.status_message = 'AI is crafting viral script and scene breakdown...';
    projectStore.saveProject(project);

    try {
      const scriptOutput = await generateScriptWithGemini({
        topic: project.topic,
        platform: project.platform,
        duration: project.duration,
        language: project.language,
        tone: project.tone,
        visual_style_name: project.visual_style?.name || 'Cinematic',
      });

      project.title = scriptOutput.title;
      project.hook = scriptOutput.hook;
      project.narration_body = scriptOutput.narration_body;
      project.call_to_action = scriptOutput.call_to_action;
      project.caption = scriptOutput.caption;
      project.hashtags = scriptOutput.hashtags;
      project.status = 'SCRIPT_READY';
      project.progress = 30;
      project.status_message = 'Script ready for review & style assignment';

      // Create scenes
      project.scenes = scriptOutput.scenes.map((sc, idx) => ({
        id: `sc-${project.id}-${idx + 1}`,
        project_id: project.id,
        scene_number: sc.scene_number,
        duration: sc.duration,
        narration: sc.narration,
        subtitle: sc.subtitle,
        visual_description: sc.visual_description,
        image_prompt: sc.image_prompt,
        video_prompt: sc.video_prompt,
        image_status: 'PENDING',
        video_status: 'PENDING',
        audio_status: 'PENDING',
        motion_intensity: 'Medium',
        camera_movement: idx % 2 === 0 ? 'Pan Up (Ascend)' : 'Zoom In',
      }));

      projectStore.saveProject(project);
      res.json(project);
    } catch (err: any) {
      project.status = 'FAILED';
      project.status_message = 'Script generation failed: ' + err.message;
      projectStore.saveProject(project);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Single Scene Update
  app.patch('/api/scenes/:sceneId', (req, res) => {
    const { sceneId } = req.params;
    const projects = projectStore.getAllProjects();

    for (const proj of projects) {
      if (proj.scenes) {
        const scene = proj.scenes.find((s) => s.id === sceneId);
        if (scene) {
          Object.assign(scene, req.body);
          projectStore.saveProject(proj);
          return res.json(scene);
        }
      }
    }

    res.status(404).json({ error: 'Scene not found' });
  });

  // 8. Generate Image for Single Scene (Granular scene regeneration)
  app.post('/api/scenes/:sceneId/generate-image', async (req, res) => {
    const { sceneId } = req.params;
    const projects = projectStore.getAllProjects();

    let targetProject: VideoProject | null = null;
    let targetScene: Scene | null = null;

    for (const proj of projects) {
      if (proj.scenes) {
        const sc = proj.scenes.find((s) => s.id === sceneId);
        if (sc) {
          targetProject = proj;
          targetScene = sc;
          break;
        }
      }
    }

    if (!targetProject || !targetScene) {
      return res.status(404).json({ error: 'Scene or project not found' });
    }
    if (req.query.queue === 'true') {
      return res.status(202).json({ job: jobQueue.enqueue({ projectId: targetProject.id, sceneId: targetScene.id, type: 'GENERATE_IMAGE' }) });
    }

    targetScene.image_status = 'GENERATING';
    projectStore.saveProject(targetProject);

    try {
      const imageUrl = await generateSceneImage(
        targetScene.image_prompt,
        targetScene.scene_number,
        targetProject.topic
      );

      targetScene.image_url = await persistImageDataUrl(targetProject.id, targetScene.id, imageUrl);
      targetScene.image_status = 'READY';
      recordAsset(targetProject.id, 'IMAGE', targetScene.image_url, imageMime(targetScene.image_url), getImageProviderId(), targetScene.id);
      projectStore.saveProject(targetProject);

      res.json({ scene: targetScene, image_url: targetScene.image_url });
    } catch (err: any) {
      targetScene.image_status = 'FAILED';
      targetScene.error_message = err.message;
      projectStore.saveProject(targetProject);
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Generate Video for Single Scene
  app.post('/api/scenes/:sceneId/generate-video', async (req, res) => {
    const { sceneId } = req.params;
    const projects = projectStore.getAllProjects();

    let targetProject: VideoProject | null = null;
    let targetScene: Scene | null = null;

    for (const proj of projects) {
      if (proj.scenes) {
        const sc = proj.scenes.find((s) => s.id === sceneId);
        if (sc) {
          targetProject = proj;
          targetScene = sc;
          break;
        }
      }
    }

    if (!targetProject || !targetScene) {
      return res.status(404).json({ error: 'Scene not found' });
    }
    if (req.query.queue === 'true') {
      return res.status(202).json({ job: jobQueue.enqueue({ projectId: targetProject.id, sceneId: targetScene.id, type: 'GENERATE_VIDEO' }) });
    }

    targetScene.video_status = 'GENERATING';
    projectStore.saveProject(targetProject);

    setTimeout(() => {
      targetScene!.video_status = 'READY';
      targetScene!.video_url = targetScene!.image_url;
      projectStore.saveProject(targetProject!);
    }, 1500);

    res.json({ scene: targetScene, message: 'Video clip animation in progress' });
  });

  // 10. Upload Custom Video (Manual Fallback)
  app.post('/api/scenes/:sceneId/upload-video', videoUpload.single('video'), async (req, res) => {
    const { sceneId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'A valid MP4 file is required' });
    if (!isMp4(req.file.buffer)) return res.status(400).json({ error: 'The uploaded file is not a valid MP4 container' });

    const projects = projectStore.getAllProjects();
    for (const proj of projects) {
      if (proj.scenes) {
        const sc = proj.scenes.find((s) => s.id === sceneId);
        if (sc) {
          const videoUrl = await saveProjectAsset(proj.id, `${sc.id}-clip.mp4`, req.file.buffer);
          const videoPath = resolveMediaUrl(videoUrl)!;
          try {
            const media = await probeMedia(videoPath);
            if (!media.video) throw new Error('MP4 does not contain a video stream');
            if (media.duration > 300) throw new Error('Scene clip must be 5 minutes or shorter');
          } catch (error) {
            await unlink(videoPath).catch(() => undefined);
            return res.status(400).json({ error: (error as Error).message });
          }
          sc.video_url = videoUrl;
          sc.video_status = 'READY';
          recordAsset(proj.id, 'VIDEO_CLIP', videoUrl, 'video/mp4', 'manual-upload', sc.id);
          projectStore.saveProject(proj);
          return res.json(sc);
        }
      }
    }

    res.status(404).json({ error: 'Scene not found' });
  });

  app.post('/api/projects/:id/upload-music', musicUpload.single('music'), async (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!req.file) return res.status(400).json({ error: 'A valid MP3 or WAV file is required' });

    const extension = req.file.mimetype === 'audio/mpeg' ? 'mp3' : 'wav';
    const musicUrl = await saveProjectAsset(project.id, `background-music.${extension}`, req.file.buffer);
    const musicPath = resolveMediaUrl(musicUrl)!;
    try {
      const media = await probeMedia(musicPath);
      if (!media.audio) throw new Error('File does not contain an audio stream');
      if (media.duration > 3600) throw new Error('Music must be one hour or shorter');
    } catch (error) {
      await unlink(musicPath).catch(() => undefined);
      return res.status(400).json({ error: (error as Error).message });
    }

    project.bg_music_url = musicUrl;
    project.bg_music_name = req.file.originalname;
    project.bg_music_volume = project.bg_music_volume ?? 0.2;
    recordAsset(project.id, 'MUSIC', musicUrl, req.file.mimetype, 'manual-upload', undefined, { originalName: req.file.originalname });
    projectStore.saveProject(project);
    res.json(project);
  });

  app.delete('/api/projects/:id/music', async (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const existingPath = project.bg_music_url ? resolveMediaUrl(project.bg_music_url) : null;
    if (existingPath) await unlink(existingPath).catch(() => undefined);
    project.bg_music_url = undefined;
    project.bg_music_name = undefined;
    projectStore.saveProject(project);
    res.json(project);
  });

  // 11. Batch Generate Images for All Scenes
  app.post('/api/projects/:id/generate-images', async (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project || !project.scenes) {
      return res.status(404).json({ error: 'Project or scenes not found' });
    }
    if (req.query.queue === 'true') {
      return res.status(202).json({ job: jobQueue.enqueue({ projectId: project.id, type: 'GENERATE_ALL_IMAGES' }) });
    }

    project.status = 'IMAGES_GENERATING';
    project.progress = 40;
    project.status_message = 'Generating visual frames for all scenes...';
    projectStore.saveProject(project);

    for (let i = 0; i < project.scenes.length; i++) {
      const sc = project.scenes[i];
      sc.image_status = 'GENERATING';
      projectStore.saveProject(project);

      const imgUrl = await generateSceneImage(sc.image_prompt, sc.scene_number, project.topic);
      sc.image_url = await persistImageDataUrl(project.id, sc.id, imgUrl);
      sc.image_status = 'READY';
      recordAsset(project.id, 'IMAGE', sc.image_url, imageMime(sc.image_url), getImageProviderId(), sc.id);

      project.progress = 40 + Math.floor(((i + 1) / project.scenes.length) * 20);
      projectStore.saveProject(project);
    }

    project.status = 'IMAGES_READY';
    project.status_message = 'All scene images generated successfully';
    projectStore.saveProject(project);

    res.json(project);
  });

  // 12. Batch Generate Voice Narration
  app.post('/api/projects/:id/generate-voice', async (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project || !project.scenes) {
      return res.status(404).json({ error: 'Project or scenes not found' });
    }
    if (req.query.queue === 'true') {
      return res.status(202).json({ job: jobQueue.enqueue({ projectId: project.id, type: 'GENERATE_VOICE' }) });
    }

    project.status = 'VOICE_GENERATING';
    project.progress = 70;
    project.status_message = 'Synthesizing voice narration and audio tracks...';
    projectStore.saveProject(project);

    for (const sc of project.scenes) {
      sc.audio_status = 'GENERATING';
      const result = await generateNarrationAudio(project.id, sc.id, sc.narration, project.language);
      sc.audio_url = result.audio_url;
      sc.audio_status = 'READY';
      recordAsset(project.id, 'VOICE', result.audio_url, 'audio/wav', result.provider, sc.id, { duration: result.duration });
      projectStore.saveProject(project);
    }

    project.status = 'VOICE_READY';
    project.progress = 80;
    project.status_message = 'Voice narration audio ready';
    projectStore.saveProject(project);

    res.json(project);
  });

  app.post('/api/projects/:id/generate-videos', (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project?.scenes?.length) return res.status(404).json({ error: 'Project or scenes not found' });
    res.status(202).json({ job: jobQueue.enqueue({ projectId: project.id, type: 'GENERATE_ALL_VIDEOS' }) });
  });

  app.post('/api/scenes/:sceneId/generate-voice', async (req, res) => {
    if (req.query.queue === 'true') {
      for (const project of projectStore.getAllProjects()) {
        const scene = project.scenes?.find((item) => item.id === req.params.sceneId);
        if (scene) return res.status(202).json({ job: jobQueue.enqueue({ projectId: project.id, sceneId: scene.id, type: 'GENERATE_VOICE' }) });
      }
      return res.status(404).json({ error: 'Scene not found' });
    }
    for (const project of projectStore.getAllProjects()) {
      const scene = project.scenes?.find((item) => item.id === req.params.sceneId);
      if (!scene) continue;
      scene.audio_status = 'GENERATING';
      projectStore.saveProject(project);
      try {
        const result = await generateNarrationAudio(project.id, scene.id, scene.narration, project.language);
        scene.audio_url = result.audio_url;
        scene.audio_status = 'READY';
        recordAsset(project.id, 'VOICE', result.audio_url, 'audio/wav', result.provider, scene.id, { duration: result.duration });
        projectStore.saveProject(project);
        return res.json(scene);
      } catch (error) {
        scene.audio_status = 'FAILED';
        scene.error_message = (error as Error).message;
        projectStore.saveProject(project);
        return res.status(500).json({ error: scene.error_message });
      }
    }
    res.status(404).json({ error: 'Scene not found' });
  });

  // 13. Render Final Video
  app.post('/api/projects/:id/render', (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (req.query.queue === 'true') {
      return res.status(202).json({ job: jobQueue.enqueue({ projectId: project.id, type: 'RENDER_FINAL' }) });
    }

    project.status = 'RENDERING';
    project.progress = 85;
    project.status_message = 'FFmpeg rendering: Stitched scene clips + audio narration + burned subtitles...';
    projectStore.saveProject(project);

    // Simulate multi-stage background rendering job
    const jobId = 'job-' + Date.now();
    const newJob: GenerationJob = {
      id: jobId,
      project_id: project.id,
      type: 'RENDER_FINAL',
      status: 'RUNNING',
      progress: 85,
      attempt_count: 1,
      max_attempts: 1,
      started_at: new Date().toISOString(),
    };

    projectStore.saveJob(newJob);

    void renderProjectVideo(project, (progress, message) => {
      newJob.progress = progress;
      project.progress = progress;
      project.status_message = message;
      projectStore.saveJob(newJob);
      projectStore.saveProject(project);
    })
      .then((finalVideoUrl) => {
        newJob.status = 'COMPLETED';
        newJob.progress = 100;
        newJob.completed_at = new Date().toISOString();
        project.status = 'REVIEW';
        project.progress = 100;
        project.status_message = 'Rendering complete! Awaiting human review & approval.';
        project.final_video_url = finalVideoUrl;
        const safeProjectId = project.id.replace(/[^a-zA-Z0-9._-]/g, '_');
        recordAsset(project.id, 'SUBTITLE', `/media/${safeProjectId}/subtitles.srt`, 'application/x-subrip', 'internal');
        recordAsset(project.id, 'FINAL_VIDEO', finalVideoUrl, 'video/mp4', 'ffmpeg');
        projectStore.saveJob(newJob);
        projectStore.saveProject(project);
      })
      .catch((error: Error) => {
        newJob.status = 'FAILED';
        newJob.error_message = error.message;
        newJob.completed_at = new Date().toISOString();
        project.status = 'FAILED';
        project.status_message = `Render failed: ${error.message}`;
        projectStore.saveJob(newJob);
        projectStore.saveProject(project);
      });

    res.json({ job: newJob, project });
  });

  // 14. Approve Project
  app.post('/api/projects/:id/approve', (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.status = 'COMPLETED';
    project.status_message = 'Approved and exported!';
    projectStore.saveProject(project);
    res.json(project);
  });

  // 15. Reject Project
  app.post('/api/projects/:id/reject', (req, res) => {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.status = 'DRAFT';
    project.status_message = 'Returned to Draft for edits';
    projectStore.saveProject(project);
    res.json(project);
  });

  // 16. Provider Settings
  app.get('/api/providers/status', async (_req, res) => {
    const [imageHealth, videoHealth, ttsHealth] = await Promise.all([
      getImageProvider().healthCheck(), getVideoProvider().healthCheck(), getTTSProvider().healthCheck(),
    ]);
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    res.json([
      { id: 'gemini', category: 'LLM', name: 'Gemini', model: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite', status: geminiConfigured ? 'Configured' : 'Not Configured', masked_key: geminiConfigured ? '••••configured' : 'NOT_SET' },
      { id: getImageProvider().id, category: 'Image', name: getImageProvider().id, model: process.env.IMAGEN_MODEL || 'local', status: imageHealth.available ? 'Active' : 'Unavailable', masked_key: 'SERVER_SIDE', usage_info: imageHealth.message },
      { id: getVideoProvider().id, category: 'Video', name: getVideoProvider().id, model: 'FFmpeg/manual', status: videoHealth.available ? 'Active' : 'Unavailable', masked_key: 'NO_KEY', usage_info: videoHealth.message },
      { id: getTTSProvider().id, category: 'TTS', name: getTTSProvider().id, model: 'VieNeu/mock', status: ttsHealth.available ? 'Active' : 'Unavailable', masked_key: 'NO_KEY', usage_info: ttsHealth.message },
    ]);
  });

  app.post('/api/providers/:category/test', async (req, res) => {
    const category = req.params.category.toLowerCase();
    const health = category === 'image' ? await getImageProvider().healthCheck()
      : category === 'video' ? await getVideoProvider().healthCheck()
      : category === 'tts' ? await getTTSProvider().healthCheck()
      : { available: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'), message: 'Gemini API key status checked.' };
    res.status(health.available ? 200 : 503).json(health);
  });

  app.patch('/api/providers/:category/select', (req, res) => {
    const category = req.params.category.toLowerCase();
    const selected = String(req.body.provider || '').toLowerCase();
    if (category === 'image' && ['placeholder', 'gemini'].includes(selected)) setImageProvider(selected);
    else if (category === 'video' && ['local-motion', 'manual'].includes(selected)) setVideoProvider(selected);
    else if (category === 'tts' && ['vieneu', 'mock'].includes(selected)) setTTSProvider(selected);
    else return res.status(400).json({ error: 'Unsupported provider selection' });
    projectStore.setSetting(`${category}_provider`, selected);
    res.json({ category, provider: selected, success: true });
  });

  app.get('/api/providers/tts/health', async (req, res) => {
    const provider = getTTSProvider();
    const health = await provider.healthCheck();
    res.status(health.available ? 200 : 503).json({ provider: provider.id, ...health });
  });

  app.get('/api/providers/image/health', async (req, res) => {
    const provider = getImageProvider();
    const health = await provider.healthCheck();
    res.status(health.available ? 200 : 503).json({ provider: provider.id, ...health });
  });

  app.get('/api/projects/:id/assets', (req, res) => {
    if (!projectStore.getProject(req.params.id)) return res.status(404).json({ error: 'Project not found' });
    res.json(projectStore.getProjectAssets(req.params.id));
  });

  app.get('/api/jobs/:id', (req, res) => {
    const job = projectStore.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.get('/api/jobs', (_req, res) => {
    res.json(projectStore.getAllJobs().slice(0, 100));
  });

  app.get('/api/projects/:id/jobs', (req, res) => {
    res.json(projectStore.getProjectJobs(req.params.id));
  });

  app.post('/api/jobs/:id/retry', (req, res) => {
    const previous = projectStore.getJob(req.params.id);
    if (!previous || previous.status !== 'FAILED') return res.status(400).json({ error: 'Only failed jobs can be retried' });
    res.status(202).json({ job: jobQueue.enqueue({
      projectId: previous.project_id, sceneId: previous.scene_id, type: previous.type,
      payload: previous.payload, maxAttempts: previous.max_attempts,
    }) });
  });

  app.get('/api/jobs/:id/events', (req, res) => {
    const initial = projectStore.getJob(req.params.id);
    if (!initial) return res.status(404).end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = (job: GenerationJob) => {
      if (job.id === req.params.id) res.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
    };
    send(initial);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    jobQueue.events.on('job', send);
    req.on('close', () => { clearInterval(heartbeat); jobQueue.events.off('job', send); });
  });

  app.get('/api/events', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = (job: GenerationJob) => res.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    jobQueue.events.on('job', send);
    _req.on('close', () => { clearInterval(heartbeat); jobQueue.events.off('job', send); });
  });

  // 17. Automations
  app.get('/api/automations', (req, res) => {
    res.json(projectStore.getAllAutomations());
  });
  app.post('/api/automations', (req, res) => {
    const rule = scheduler.schedule({ id: `auto-${Date.now()}`, name: req.body.name || 'Automation mới', niche: req.body.niche || 'Kiến thức thú vị', frequency: req.body.frequency || 'Daily', language: req.body.language || 'Tiếng Việt', duration: req.body.duration || '30 seconds', content_style: req.body.content_style || 'Hấp dẫn', auto_script: req.body.auto_script ?? true, auto_image: req.body.auto_image ?? true, auto_video: req.body.auto_video ?? true, auto_voice: req.body.auto_voice ?? true, auto_render: req.body.auto_render ?? true, require_review: true, status: req.body.status || 'Paused', topic_template: req.body.topic_template || req.body.niche || 'Kiến thức thú vị ngày {date}', platform: req.body.platform || 'TikTok / Shorts (9:16)', run_at: req.body.run_at || '09:00', timezone: req.body.timezone || 'Asia/Bangkok' });
    res.status(201).json(rule);
  });
  app.patch('/api/automations/:id', (req, res) => {
    const current = projectStore.getAutomation(req.params.id); if (!current) return res.status(404).json({ error: 'Automation not found' });
    res.json(scheduler.schedule({ ...current, ...req.body, id: current.id, require_review: true }));
  });
  app.delete('/api/automations/:id', (req, res) => res.json({ success: projectStore.deleteAutomation(req.params.id) }));
  app.post('/api/automations/:id/run', (req, res) => {
    const rule = projectStore.getAutomation(req.params.id); if (!rule) return res.status(404).json({ error: 'Automation not found' });
    scheduler.runNow(rule); res.status(202).json(rule);
  });

  app.get('/api/usage', (req, res) => res.json(getUsageSummary(String(req.query.month || new Date().toISOString().slice(0, 7)))));
  app.patch('/api/usage/budget', (req, res) => { const value = Math.max(0, Number(req.body.monthly_budget_usd)); projectStore.setSetting('monthly_budget_usd', String(value)); res.json(getUsageSummary()); });
  app.get('/api/publications', (req, res) => res.json(projectStore.getPublications(req.query.project_id ? String(req.query.project_id) : undefined)));
  app.post('/api/projects/:id/publish', async (req, res) => {
    const project = projectStore.getProject(req.params.id); if (!project) return res.status(404).json({ error: 'Project not found' });
    const item = await publishProject(project, req.body.platform || 'Export Package'); res.status(item.status === 'FAILED' ? 400 : 201).json(item);
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime_seconds: Math.round(process.uptime()), queue: { pending: projectStore.getRunnableJobs().length, ...jobQueue.stats() }, database: 'connected', timestamp: new Date().toISOString() }));
  app.get('/api/ready', (_req, res) => res.json({ ready: true }));

  // Video dubbing studio
  // Keep the project picker lightweight. Long transcripts and voice metadata
  // are loaded only for the selected project via /api/dubbing/:id.
  app.get('/api/dubbing', (_req,res)=>res.json(projectStore.getDubbingProjects().map(item=>({
    id:item.id,title:item.title,status:item.status,progress:item.progress,duration:item.duration,
    series_name:item.series_name,episode_number:item.episode_number,parent_project_id:item.parent_project_id,
    part_number:item.part_number,part_count:item.part_count,created_at:item.created_at,updated_at:item.updated_at,
  }))));
  app.get('/api/dubbing/:id', (req,res)=>{const item=projectStore.getDubbingProject(req.params.id); return item?res.json(item):res.status(404).json({error:'Dubbing project not found'});});
  app.post('/api/dubbing', dubbingUpload.single('video'), async (req,res)=>{
    if(!req.file || !isMp4(req.file.buffer)) return res.status(400).json({error:'Vui lòng chọn file MP4 hợp lệ'});
    const id=`dub-${Date.now()}`; const url=await saveProjectAsset(id,'source.mp4',req.file.buffer); const info=await probeMedia(resolveMediaUrl(url)!);
    if(!info.video || !info.audio) return res.status(400).json({error:'Video cần có cả hình và âm thanh'});
    const originalName = decodeUploadName(req.file.originalname);
    const now=new Date().toISOString(); const item:DubbingProject={id,title:req.body.title||originalName.replace(/\.mp4$/i,''),source_video_url:url,source_language:req.body.source_language||'auto',target_language:req.body.target_language||'vi',mode:req.body.mode||'VOICEOVER',status:'UPLOADED',progress:0,duration:info.duration,original_audio_volume:Number(req.body.original_audio_volume||.25),voice_volume:Number(req.body.voice_volume||1),voice_profile:req.body.voice_profile||'co-gai-hoat-ngon',burn_subtitles:req.body.burn_subtitles!=='false',subtitle_position:Number(req.body.subtitle_position||78),blur_source_text:true,source_text_blur_x:0,source_text_blur_y:70,source_text_blur_width:100,source_text_blur_height:30,source_text_blur_strength:12,voice_delay_ms:Number(req.body.voice_delay_ms||200),segments:[],created_at:now,updated_at:now};
    projectStore.saveDubbingProject(item); res.status(201).json(item);
  });
  app.patch('/api/dubbing/:id',(req,res)=>{const item=projectStore.getDubbingProject(req.params.id);if(!item)return res.status(404).json({error:'Dubbing project not found'});Object.assign(item,req.body,{id:item.id,source_video_url:item.source_video_url});projectStore.saveDubbingProject(item);res.json(item);});
  app.delete('/api/dubbing/:id',async(req,res)=>{
    const safeId=req.params.id.replace(/[^a-zA-Z0-9._-]/g,'_');
    if(!safeId||safeId==='.'||safeId==='..')return res.status(400).json({error:'Invalid project id'});
    const root=path.resolve(getStorageRoot());const target=path.resolve(root,safeId);
    if(!target.startsWith(root+path.sep))return res.status(400).json({error:'Invalid project storage path'});
    const success=projectStore.deleteDubbingProject(req.params.id);
    if(success)await rm(target,{recursive:true,force:true});
    res.json({success});
  });
  app.post('/api/dubbing/:id/transcribe', (req, res) => {
    const item = projectStore.getDubbingProject(req.params.id);
    if (!item) return res.status(404).json({ error: 'Dubbing project not found' });
    const existing=projectStore.getAllJobs().find(job=>job.project_id===item.id&&job.type==='DUB_TRANSCRIBE'&&(job.status==='PENDING'||job.status==='RUNNING'));
    if(existing)return res.status(202).json({job:existing,reused:true});
    projectStore.createSnapshot(item.id, 'Tự động lưu trước khi ASR', 'PRE_ASR');
    res.status(202).json({ job: jobQueue.enqueue({ projectId: item.id, type: 'DUB_TRANSCRIBE', maxAttempts: 1 }) });
  });
  app.post('/api/dubbing/:id/analyze-video-splits', async (req, res) => {
    const item = projectStore.getDubbingProject(req.params.id);
    if (!item) return res.status(404).json({ error: 'Dubbing project not found' });
    try {
      const gapCount = (project: DubbingProject) => project.segments.slice(1).filter((segment, index) => segment.start - project.segments[index].end >= 0.35).length;
      const historical = projectStore.getSnapshots(item.id)
        .map(snapshot => snapshot.data as DubbingProject)
        .filter(project => project.segments?.length && gapCount(project) > 0)
        .sort((a, b) => gapCount(b) - gapCount(a))[0];
      // Segment-repair tools can intentionally make the current timeline
      // contiguous. The untouched ASR snapshot remains the safer cut reference.
      const reference = gapCount(item) > 0 ? item : historical ? { ...item, segments: historical.segments } : item;
      const plan = await analyzeSafeSplitPoints(reference, Number(req.body.target_minutes || 8), 5, 10);
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
  app.post('/api/dubbing/:id/split-video', async (req, res) => {
    const item = projectStore.getDubbingProject(req.params.id);
    if (!item) return res.status(404).json({ error: 'Dubbing project not found' });
    const rawPoints: unknown[] = Array.isArray(req.body.cut_points) ? req.body.cut_points : [];
    const points: number[] = Array.from(new Set(rawPoints.map(value => Number(value))))
      .filter(value => Number.isFinite(value) && value > 1 && value < item.duration - 1)
      .sort((a, b) => a - b);
    if (!points.length) return res.status(400).json({ error: 'Chưa có điểm cắt hợp lệ.' });
    if (points.some((value, index) => value - (index ? points[index - 1] : 0) < 30) || item.duration - points[points.length - 1] < 30) {
      return res.status(400).json({ error: 'Mỗi phần video phải dài ít nhất 30 giây.' });
    }
    try {
      const files = await splitVideoIntoFiles(item, points);
      const now = new Date().toISOString();
      const children = files.map((file, index) => {
        const child: DubbingProject = {
          ...item,
          id: `${item.id}-part-${String(index + 1).padStart(2, '0')}`,
          title: `${item.title} — Phần ${index + 1}/${files.length}`,
          source_video_url: file.url,
          status: 'UPLOADED', progress: 0, duration: file.duration, segments: [],
          output_video_url: undefined, error_message: undefined,
          parent_project_id: item.id, part_number: index + 1, part_count: files.length,
          source_start_offset: file.start, created_at: now, updated_at: now,
        };
        projectStore.saveDubbingProject(child);
        return child;
      });
      res.status(201).json({ parent_id: item.id, parts: children });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
  app.post('/api/dubbing/:id/translate', async (req, res) => {
    const item = projectStore.getDubbingProject(req.params.id);
    if (!item) return res.status(404).json({ error: 'Dubbing project not found' });
    projectStore.createSnapshot(item.id, 'Tự động lưu trước khi dịch', 'PRE_TRANSLATE');
    try {
      await translateTranscript(item);
      projectStore.saveDubbingProject(item);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  app.post('/api/dubbing/:id/translate-missing', async (req,res)=>{
    const item=projectStore.getDubbingProject(req.params.id);
    if(!item)return res.status(404).json({error:'Dubbing project not found'});
    projectStore.createSnapshot(item.id,'Trước khi sửa đoạn chưa dịch','PRE_TRANSLATE');
    try{await translateMissingTranscript(item);projectStore.saveDubbingProject(item);res.json(item);}catch(error){projectStore.saveDubbingProject(item);res.status(400).json({error:(error as Error).message});}
  });
  app.post('/api/dubbing/:id/analyze-story', async (req,res)=>{
    const item=projectStore.getDubbingProject(req.params.id);
    if(!item)return res.status(404).json({error:'Dubbing project not found'});
    if(!item.segments.length)return res.status(400).json({error:'Hãy nhận dạng toàn bộ video trước khi phân tích cốt truyện.'});
    try{
      const previous=projectStore.getDubbingProjects()
        .filter(p=>p.id!==item.id&&item.series_name&&p.series_name===item.series_name&&p.story_summary&&(p.episode_number??0)<(item.episode_number??999999))
        .sort((a,b)=>(a.episode_number??0)-(b.episode_number??0))
        .map(p=>`Tập ${p.episode_number??'?'}: ${p.story_summary}`);
      await analyzeStoryContext(item,previous);projectStore.saveDubbingProject(item);res.json(item);
    }catch(error){res.status(400).json({error:(error as Error).message});}
  });
  app.post('/api/dubbing/:id/repair-segments',(req,res)=>{
    const item=projectStore.getDubbingProject(req.params.id);if(!item)return res.status(404).json({error:'Dubbing project not found'});
    projectStore.createSnapshot(item.id,'Trước khi ghép câu bị cắt','MANUAL');
    repairBrokenTranslationSegments(item);projectStore.saveDubbingProject(item);res.json(item);
  });
  app.post('/api/dubbing/:id/split-overlong-segments',(req,res)=>{
    const item=projectStore.getDubbingProject(req.params.id);if(!item)return res.status(404).json({error:'Dubbing project not found'});
    projectStore.createSnapshot(item.id,'Trước khi tách đoạn thoại quá dài','MANUAL');
    splitOverlongSegments(item, 6.5);projectStore.saveDubbingProject(item);res.json(item);
  });
  app.post('/api/dubbing/:id/render', (req, res) => {
    const item = projectStore.getDubbingProject(req.params.id);
    if (!item) return res.status(404).json({ error: 'Dubbing project not found' });
    const untranslated = item.segments.filter(segment => segment.enabled && isInvalidTranslationSegment(segment));
    if (untranslated.length) return res.status(409).json({
      error: `Còn ${untranslated.length} đoạn tiếng Trung chưa được dịch. Hãy bấm “Dịch đoạn còn thiếu” rồi xuất lại.`,
      missing_translation_count: untranslated.length,
      segment_ids: untranslated.map(segment => segment.id),
    });
    const existing=projectStore.getAllJobs().find(job=>job.project_id===item.id&&job.type==='DUB_RENDER'&&(job.status==='PENDING'||job.status==='RUNNING'));
    if(existing)return res.status(202).json({job:existing,reused:true});
    res.status(202).json({ job: jobQueue.enqueue({ projectId: item.id, type: 'DUB_RENDER', maxAttempts: 1 }) });
  });
  app.post('/api/dubbing/:id/segments/:segmentId/preview', (req, res) => {
    const item = projectStore.getDubbingProject(req.params.id);
    const segment = item?.segments.find(s => s.id === req.params.segmentId);
    if (!item || !segment) return res.status(404).json({ error: 'Không tìm thấy đoạn thoại' });
    const existing=projectStore.getAllJobs().find(job=>job.project_id===item.id&&job.scene_id===segment.id&&job.type==='DUB_SEGMENT_PREVIEW'&&(job.status==='PENDING'||job.status==='RUNNING'));
    if(existing)return res.status(202).json({job:existing,reused:true});
    res.status(202).json({job:jobQueue.enqueue({projectId:item.id,sceneId:segment.id,type:'DUB_SEGMENT_PREVIEW',maxAttempts:1})});
  });

  // Series & Knowledge Hub API
  const seriesSettingKey=(name:string)=>`series_profile:${Buffer.from(name.trim(),'utf8').toString('base64url')}`;
  const readSeriesProfile=(name:string)=>{try{return JSON.parse(projectStore.getSetting(seriesSettingKey(name))||'{}')}catch{return {}}};
  const saveSeriesProfile=(name:string,data:any)=>{const value={...data,series_name:name.trim(),updated_at:new Date().toISOString()};projectStore.setSetting(seriesSettingKey(name),JSON.stringify(value));return value;};
  app.get('/api/series', (req, res) => {
    const projects = projectStore.getDubbingProjects();
    const seriesMap = new Map<string, any>();

    for (const p of projects) {
      const sName = p.series_name?.trim();
      if (!sName) continue;
      if (!seriesMap.has(sName)) {
        seriesMap.set(sName, { series_name: sName, count: 0, episodes: [] });
      }
      const entry = seriesMap.get(sName);
      entry.count++;
      entry.episodes.push({
        id: p.id,
        episode_number: p.episode_number || 1,
        title: p.title,
        summary: p.story_summary || '',
        created_at: p.created_at,
      });
    }

    for(const row of projectStore.getSettingsByPrefix('series_profile:')){
      try{const profile=JSON.parse(row.value);const name=String(profile.series_name||'').trim();if(name&&!seriesMap.has(name))seriesMap.set(name,{series_name:name,count:0,episodes:[]});}catch{}
    }

    const result = Array.from(seriesMap.values()).map(s => {
      s.episodes.sort((a: any, b: any) => (a.episode_number || 0) - (b.episode_number || 0));
      return s;
    });
    res.json(result);
  });

  app.post('/api/series',(req,res)=>{
    const name=String(req.body.series_name||'').trim();
    if(!name)return res.status(400).json({error:'Tên series không được để trống.'});
    const existing=readSeriesProfile(name);
    res.status(201).json(saveSeriesProfile(name,{overall_arc:'',main_characters:[],supporting_characters:[],glossary:{},...existing}));
  });

  app.get('/api/series/:name', (req, res) => {
    const seriesName = req.params.name;
    const stored=readSeriesProfile(seriesName);
    const projects = projectStore.getDubbingProjects().filter(p => p.series_name?.trim() === seriesName.trim());
    projects.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));

    const mainChars: any[] = [];
    const suppChars: any[] = [];
    const glossary: Record<string, string> = {};
    const episodes: any[] = [];

    for (const p of projects) {
      episodes.push({
        id: p.id,
        episode_number: p.episode_number || 1,
        title: p.title,
        summary: p.story_summary || '',
        story_context: p.story_context || '',
        characters: (()=>{try{return JSON.parse(p.story_context||'{}').characters||[]}catch{return []}})(),
        created_at: p.created_at,
      });

      if (p.story_context) {
        try {
          const parsed = JSON.parse(p.story_context);
          if (parsed.characters && Array.isArray(parsed.characters)) {
            for (const c of parsed.characters) {
              const roleText=String(c.role||'').toLowerCase();
              const target=/phụ|support|secondary/.test(roleText)?suppChars:mainChars;
              const existing = [...mainChars,...suppChars].find(m => m.name === c.name);
              if (!existing) {
                target.push({
                  name: c.name || 'Unknown',
                  original_name: c.original_name,
                  gender: c.gender || 'Không rõ',
                  role: c.role || (target===mainChars?'Chính':'Phụ'),
                  pronouns: c.pronouns || 'tôi - cậu',
                  personality: c.personality || '',
                  description: c.description || '',
                  episodes_appeared: [p.episode_number || 1],
                });
              } else {
                if (!existing.episodes_appeared.includes(p.episode_number || 1)) {
                  existing.episodes_appeared.push(p.episode_number || 1);
                }
              }
            }
          }
          if (parsed.glossary && typeof parsed.glossary === 'object') {
            Object.assign(glossary, parsed.glossary);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    const overallArc = episodes.map(e => `[Tập ${e.episode_number}] ${e.summary}`).join('\n\n');

    res.json({
      series_name: seriesName,
      overall_arc: stored.overall_arc || overallArc || 'Chưa có tóm tắt tuyến truyện tổng thể.',
      main_characters: stored.main_characters?.length?stored.main_characters:mainChars,
      supporting_characters: stored.supporting_characters?.length?stored.supporting_characters:suppChars,
      glossary: {...glossary,...(stored.glossary||{})},
      thumbnail_concepts: Array.isArray(stored.thumbnail_concepts)?stored.thumbnail_concepts:[],
      episodes,
      last_synthesized_at: stored.last_synthesized_at,
      updated_at: stored.updated_at,
    });
  });

  app.patch('/api/series/:name',(req,res)=>{
    const name=req.params.name.trim();
    if(!name)return res.status(400).json({error:'Tên series không hợp lệ.'});
    const current=readSeriesProfile(name);
    const allowed={overall_arc:req.body.overall_arc??current.overall_arc??'',main_characters:Array.isArray(req.body.main_characters)?req.body.main_characters:current.main_characters??[],supporting_characters:Array.isArray(req.body.supporting_characters)?req.body.supporting_characters:current.supporting_characters??[],glossary:req.body.glossary&&typeof req.body.glossary==='object'?req.body.glossary:current.glossary??{},thumbnail_concepts:Array.isArray(req.body.thumbnail_concepts)?req.body.thumbnail_concepts:current.thumbnail_concepts??[],last_synthesized_at:req.body.last_synthesized_at??current.last_synthesized_at};
    saveSeriesProfile(name,allowed);
    res.json({...allowed,series_name:name,episodes:projectStore.getDubbingProjects().filter(p=>p.series_name?.trim()===name).map(p=>({id:p.id,episode_number:p.episode_number||1,title:p.title,summary:p.story_summary||'',story_context:p.story_context||'',created_at:p.created_at}))});
  });

  app.post('/api/series/:name/synthesize', async (req, res) => {
    const seriesName = req.params.name;
    const projects = projectStore.getDubbingProjects().filter(p => p.series_name?.trim() === seriesName.trim());
    projects.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));

    if (!projects.length) return res.status(404).json({ error: 'Không tìm thấy tập phim nào trong Series này.' });

    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') return res.status(400).json({ error: 'Cần GEMINI_API_KEY để phân tích Series.' });

    try {
      const summarizeText = projects.map(p => `--- Tập ${p.episode_number || 1}: ${p.title} ---\nTóm tắt: ${p.story_summary || 'Chưa có'}\nBối cảnh: ${p.story_context || ''}`).join('\n\n');
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite',
        contents: `Analyze this multi-episode video series and extract a unified Series Lore Manual in JSON format.\nReturn JSON with keys:\n- overall_arc: comprehensive summary of the entire series story arc\n- main_characters: list of objects { name, original_name, gender ("Nam"|"Nữ"), role ("Chính"|"Phụ"), pronouns ("tôi - cậu"|"anh - em"|etc), personality, description }\n- supporting_characters: list of secondary characters\n- glossary: object mapping original Chinese/English proper nouns to official Vietnamese translations\n\nSeries Name: ${seriesName}\nAll Episodes Data:\n${summarizeText}`,
        config: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(response.text || '{}');
      const episodes = projects.map(p => ({
        id: p.id,
        episode_number: p.episode_number || 1,
        title: p.title,
        summary: p.story_summary || '',
        created_at: p.created_at,
      }));

      const currentProfile=readSeriesProfile(seriesName);
      const synthesized={
        series_name: seriesName,
        overall_arc: parsed.overall_arc || '',
        main_characters: parsed.main_characters || [],
        supporting_characters: parsed.supporting_characters || [],
        glossary: parsed.glossary || {},
        thumbnail_concepts: currentProfile.thumbnail_concepts||[],
        episodes,
        last_synthesized_at: new Date().toISOString(),
      };
      saveSeriesProfile(seriesName,synthesized);
      res.json(synthesized);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/series/:name/thumbnails/concepts',async(req,res)=>{
    const seriesName=req.params.name.trim();const stored=readSeriesProfile(seriesName);
    const projects=projectStore.getDubbingProjects().filter(project=>project.series_name?.trim()===seriesName);
    const episodeId=String(req.body.episode_id||'');const episode=projects.find(project=>project.id===episodeId)||projects[0];
    if(!episode)return res.status(404).json({error:'Series chưa có video để thiết kế thumbnail.'});
    const key=process.env.GEMINI_API_KEY;if(!key||key==='MY_GEMINI_API_KEY')return res.status(400).json({error:'Cần GEMINI_API_KEY để AI thiết kế thumbnail.'});
    try{
      const characters=[...(stored.main_characters||[]),...(stored.supporting_characters||[])].slice(0,8);
      const ai=new GoogleGenAI({apiKey:key});const style=String(req.body.style||'Điện ảnh, tương phản mạnh');
      const prompt=[
        'Act as a senior YouTube thumbnail art director. Create exactly 3 distinct high-CTR thumbnail concepts.',
        'Return JSON object {"concepts":[...]}. Each concept contains headline (2-7 Vietnamese words), subheadline (optional, max 8 words), visual_prompt (English image prompt; 16:9; no text, logo or watermark), layout, palette (3 hex colors), hook_reason.',
        `Keep characters consistent with dossiers. Do not invent spoilers. Style: ${style}.`,
        `Series: ${seriesName}`,
        `Episode ${episode.episode_number||1}: ${episode.title}`,
        `Episode summary: ${episode.story_summary||'Chưa có tóm tắt'}`,
        `Series arc: ${stored.overall_arc||''}`,
        `Characters: ${JSON.stringify(characters)}`,
      ].join('\n');
      const response=await ai.models.generateContent({model:process.env.GEMINI_TEXT_MODEL||'gemini-3.5-flash-lite',contents:prompt,config:{responseMimeType:'application/json'}});
      const parsed=JSON.parse(response.text||'{}');const now=new Date().toISOString();
      const concepts=(Array.isArray(parsed.concepts)?parsed.concepts:[]).slice(0,3).map((concept:any,index:number)=>({
        id:`thumb-${Date.now()}-${index+1}`,episode_id:episode.id,episode_number:episode.episode_number||1,episode_title:episode.title,
        headline:String(concept.headline||`Tập ${episode.episode_number||1}`).slice(0,80),subheadline:String(concept.subheadline||'').slice(0,120),
        visual_prompt:String(concept.visual_prompt||'cinematic animated mystery scene').slice(0,2000),layout:String(concept.layout||''),
        palette:Array.isArray(concept.palette)?concept.palette.slice(0,3):['#8B5CF6','#111827','#FFFFFF'],hook_reason:String(concept.hook_reason||''),style,created_at:now,
      }));
      if(!concepts.length)throw new Error('Gemini không trả về concept thumbnail hợp lệ.');
      const previous=Array.isArray(stored.thumbnail_concepts)?stored.thumbnail_concepts:[];
      const kept=previous.filter((concept:any)=>concept.episode_id!==episode.id);
      const profile=saveSeriesProfile(seriesName,{...stored,thumbnail_concepts:[...kept,...concepts]});
      res.json({...profile,concepts});
    }catch(error){res.status(500).json({error:(error as Error).message});}
  });

  app.post('/api/series/:name/thumbnails/:conceptId/generate',async(req,res)=>{
    const seriesName=req.params.name.trim();const stored=readSeriesProfile(seriesName);
    const concepts=Array.isArray(stored.thumbnail_concepts)?stored.thumbnail_concepts:[];
    const index=concepts.findIndex((concept:any)=>concept.id===req.params.conceptId);
    if(index<0)return res.status(404).json({error:'Không tìm thấy concept thumbnail.'});
    try{
      const concept=concepts[index];
      const generated=await generateSceneImage(concept.visual_prompt,index+1,concept.episode_title||seriesName,'16:9');
      const imageUrl=await composeAndSaveThumbnail(seriesName,concept.id,generated,concept.headline,concept.subheadline,concept.palette?.[0]);
      concepts[index]={...concept,image_url:imageUrl,generated_at:new Date().toISOString(),image_provider:getImageProviderId()};
      const profile=saveSeriesProfile(seriesName,{...stored,thumbnail_concepts:concepts});res.json({...profile,concept:concepts[index]});
    }catch(error){res.status(500).json({error:(error as Error).message});}
  });

  // Snapshots API Endpoints (Version History / Undo)
  app.get('/api/dubbing/:id/snapshots', (req, res) => {
    res.json(projectStore.getSnapshots(req.params.id));
  });

  app.post('/api/dubbing/:id/snapshots', (req, res) => {
    const snapshot = projectStore.createSnapshot(req.params.id, req.body.name || 'Bản lưu thủ công', req.body.type || 'MANUAL');
    if (!snapshot) return res.status(404).json({ error: 'Dubbing project not found' });
    res.status(201).json(snapshot);
  });

  app.post('/api/dubbing/:id/snapshots/:snapshotId/restore', (req, res) => {
    const restored = projectStore.restoreSnapshot(req.params.id, req.params.snapshotId);
    if (!restored) return res.status(404).json({ error: 'Snapshot or project not found' });
    res.json(restored);
  });

  app.delete('/api/dubbing/:id/snapshots/:snapshotId', (req, res) => {
    res.json({ success: projectStore.deleteSnapshot(req.params.snapshotId) });
  });

  app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file is too large' : error.message });
    }
    if (error) return res.status(500).json({ error: error.message || 'Unexpected server error' });
    next();
  });

  // --- VITE / STATIC SERVING MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/media')) {
        return next();
      }
      try {
        let template = await readFile(path.resolve('index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Video Factory server running on http://localhost:${PORT}`);
  });
}

startServer();

function registerJobHandlers() {
  jobQueue.register('GENERATE_SCRIPT', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    if (!project) throw new NonRetryableJobError('Project not found');
    project.status = 'SCRIPT_GENERATING'; project.progress = 10; project.status_message = 'AI đang viết kịch bản...';
    projectStore.saveProject(project); update(15, project.status_message);
    const output = await generateScriptWithGemini({
      topic: project.topic, platform: project.platform, duration: project.duration,
      language: project.language, tone: project.tone, visual_style_name: project.visual_style?.name || 'Cinematic',
    });
    Object.assign(project, {
      title: output.title, hook: output.hook, narration_body: output.narration_body,
      call_to_action: output.call_to_action, caption: output.caption, hashtags: output.hashtags,
      status: 'SCRIPT_READY', progress: 30, status_message: 'Kịch bản đã sẵn sàng để duyệt',
    });
    project.scenes = output.scenes.map((scene, index) => ({
      id: `sc-${project.id}-${index + 1}`, project_id: project.id, scene_number: scene.scene_number,
      duration: scene.duration, narration: scene.narration, subtitle: scene.subtitle,
      visual_description: scene.visual_description, image_prompt: scene.image_prompt, video_prompt: scene.video_prompt,
      image_status: 'PENDING', video_status: 'PENDING', audio_status: 'PENDING', motion_intensity: 'Medium',
      camera_movement: index % 2 === 0 ? 'Pan Up (Ascend)' : 'Zoom In',
    }));
    projectStore.saveProject(project); update(100, project.status_message);
  });

  jobQueue.register('GENERATE_IMAGE', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    const scene = project?.scenes?.find((item) => item.id === job.scene_id);
    if (!project || !scene) throw new NonRetryableJobError('Scene not found');
    scene.image_status = 'GENERATING'; projectStore.saveProject(project); update(20, `Đang tạo ảnh scene ${scene.scene_number}`);
    const generated = await generateSceneImage(scene.image_prompt, scene.scene_number, project.topic);
    scene.image_url = await persistImageDataUrl(project.id, scene.id, generated);
    scene.image_status = 'READY'; projectStore.saveProject(project);
    recordAsset(project.id, 'IMAGE', scene.image_url, imageMime(scene.image_url), getImageProviderId(), scene.id);
    update(100, `Ảnh scene ${scene.scene_number} đã sẵn sàng`);
  });

  jobQueue.register('GENERATE_ALL_IMAGES', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    if (!project?.scenes?.length) throw new NonRetryableJobError('Project has no scenes');
    project.status = 'IMAGES_GENERATING'; project.progress = 35; projectStore.saveProject(project);
    for (let index = 0; index < project.scenes.length; index += 1) {
      const scene = project.scenes[index]; scene.image_status = 'GENERATING'; projectStore.saveProject(project);
      const generated = await generateSceneImage(scene.image_prompt, scene.scene_number, project.topic);
      scene.image_url = await persistImageDataUrl(project.id, scene.id, generated); scene.image_status = 'READY';
      recordAsset(project.id, 'IMAGE', scene.image_url, imageMime(scene.image_url), getImageProviderId(), scene.id);
      project.progress = 40 + Math.round(((index + 1) / project.scenes.length) * 20); projectStore.saveProject(project);
      update(Math.round(((index + 1) / project.scenes.length) * 100), `Đã tạo ảnh ${index + 1}/${project.scenes.length}`);
    }
    project.status = 'IMAGES_READY'; project.status_message = 'Toàn bộ ảnh đã sẵn sàng'; projectStore.saveProject(project);
  });

  jobQueue.register('GENERATE_VIDEO', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    const scene = project?.scenes?.find((item) => item.id === job.scene_id);
    if (!project || !scene) throw new NonRetryableJobError('Scene not found');
    scene.video_status = 'GENERATING'; projectStore.saveProject(project); update(15, `Đang tạo chuyển động scene ${scene.scene_number}`);
    const result = await getVideoProvider().generate(scene, project);
    scene.video_url = result.url; scene.video_status = 'READY'; projectStore.saveProject(project);
    recordAsset(project.id, 'VIDEO_CLIP', result.url, 'video/mp4', result.provider, scene.id, { model: result.model });
    update(100, `Clip scene ${scene.scene_number} đã sẵn sàng`);
  });

  jobQueue.register('GENERATE_ALL_VIDEOS', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    if (!project?.scenes?.length) throw new NonRetryableJobError('Project has no scenes');
    project.status = 'VIDEOS_GENERATING'; projectStore.saveProject(project);
    for (let index = 0; index < project.scenes.length; index += 1) {
      const scene = project.scenes[index];
      if (!scene.image_url) throw new NonRetryableJobError(`Scene ${scene.scene_number} has no image`);
      scene.video_status = 'GENERATING'; projectStore.saveProject(project);
      const result = await getVideoProvider().generate(scene, project);
      scene.video_url = result.url; scene.video_status = 'READY';
      recordAsset(project.id, 'VIDEO_CLIP', result.url, 'video/mp4', result.provider, scene.id, { model: result.model });
      project.progress = 60 + Math.round(((index + 1) / project.scenes.length) * 10); projectStore.saveProject(project);
      update(Math.round(((index + 1) / project.scenes.length) * 100), `Đã tạo clip ${index + 1}/${project.scenes.length}`);
    }
    project.status = 'VIDEOS_READY'; project.status_message = 'Toàn bộ clip đã sẵn sàng'; projectStore.saveProject(project);
  });

  jobQueue.register('GENERATE_VOICE', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    if (!project?.scenes?.length) throw new NonRetryableJobError('Project has no scenes');
    project.status = 'VOICE_GENERATING'; projectStore.saveProject(project);
    const targetScenes = job.scene_id ? project.scenes.filter((scene) => scene.id === job.scene_id) : project.scenes;
    for (let index = 0; index < targetScenes.length; index += 1) {
      const scene = targetScenes[index]; scene.audio_status = 'GENERATING'; projectStore.saveProject(project);
      const result = await generateNarrationAudio(project.id, scene.id, scene.narration, project.language);
      scene.audio_url = result.audio_url; scene.audio_status = 'READY';
      recordAsset(project.id, 'VOICE', result.audio_url, 'audio/wav', result.provider, scene.id, { duration: result.duration });
      projectStore.saveProject(project); update(Math.round(((index + 1) / targetScenes.length) * 100), `Đã tạo giọng ${index + 1}/${targetScenes.length}`);
    }
    project.status = 'VOICE_READY'; project.progress = 80; project.status_message = 'Giọng đọc đã sẵn sàng'; projectStore.saveProject(project);
  });

  jobQueue.register('RENDER_FINAL', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    if (!project) throw new NonRetryableJobError('Project not found');
    project.status = 'RENDERING'; project.progress = 82; projectStore.saveProject(project);
    const url = await renderProjectVideo(project, (progress, message) => {
      project.progress = progress; project.status_message = message; projectStore.saveProject(project); update(progress, message);
    });
    project.final_video_url = url; project.status = 'REVIEW'; project.progress = 100; project.status_message = 'Render hoàn tất, đang chờ duyệt';
    projectStore.saveProject(project);
    const safeId = project.id.replace(/[^a-zA-Z0-9._-]/g, '_');
    recordAsset(project.id, 'SUBTITLE', `/media/${safeId}/subtitles.srt`, 'application/x-subrip', 'internal');
    recordAsset(project.id, 'FINAL_VIDEO', url, 'video/mp4', 'ffmpeg');
    recordUsage({ project_id: project.id, job_id: job.id, provider: 'ffmpeg', operation: 'render-second', units: project.scenes?.reduce((sum, scene) => sum + scene.duration, 0) || 0, unit_name: 'seconds' });
  });

  jobQueue.register('RUN_AUTOMATION', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id);
    const rule = projectStore.getAutomation(String(job.payload?.ruleId || ''));
    if (!project || !rule) throw new NonRetryableJobError('Automation or project not found');
    assertBudgetAvailable();
    update(3, 'Đang tạo kịch bản tự động');
    const output = await generateScriptWithGemini({ topic: project.topic, platform: project.platform, duration: project.duration, language: project.language, tone: project.tone, visual_style_name: project.visual_style?.name || 'Cinematic' });
    Object.assign(project, { title: output.title, hook: output.hook, narration_body: output.narration_body, call_to_action: output.call_to_action, caption: output.caption, hashtags: output.hashtags, status: 'SCRIPT_READY', progress: 20 });
    project.scenes = output.scenes.map((scene, index) => ({ id: `sc-${project.id}-${index + 1}`, project_id: project.id, scene_number: scene.scene_number, duration: scene.duration, narration: scene.narration, subtitle: scene.subtitle, visual_description: scene.visual_description, image_prompt: scene.image_prompt, video_prompt: scene.video_prompt, image_status: 'PENDING', video_status: 'PENDING', audio_status: 'PENDING', motion_intensity: 'Medium', camera_movement: index % 2 ? 'Zoom In' : 'Pan Up (Ascend)' }));
    projectStore.saveProject(project); recordUsage({ project_id: project.id, job_id: job.id, provider: process.env.GEMINI_API_KEY ? 'gemini' : 'local-fallback', operation: 'script', units: 1, unit_name: 'script' });
    if (rule.auto_image) for (let i = 0; i < project.scenes.length; i++) { const scene = project.scenes[i]; const generated = await generateSceneImage(scene.image_prompt, scene.scene_number, project.topic); scene.image_url = await persistImageDataUrl(project.id, scene.id, generated); scene.image_status = 'READY'; recordAsset(project.id, 'IMAGE', scene.image_url, imageMime(scene.image_url), getImageProviderId(), scene.id); recordUsage({ project_id: project.id, job_id: job.id, provider: getImageProviderId(), operation: 'image', units: 1, unit_name: 'image' }); update(20 + Math.round((i + 1) / project.scenes.length * 25), `Ảnh ${i + 1}/${project.scenes.length}`); }
    if (rule.auto_video) for (let i = 0; i < project.scenes.length; i++) { const scene = project.scenes[i]; if (!scene.image_url) throw new NonRetryableJobError(`Scene ${scene.scene_number} has no image`); const result = await getVideoProvider().generate(scene, project); scene.video_url = result.url; scene.video_status = 'READY'; recordAsset(project.id, 'VIDEO_CLIP', result.url, 'video/mp4', result.provider, scene.id); update(45 + Math.round((i + 1) / project.scenes.length * 20), `Video ${i + 1}/${project.scenes.length}`); }
    if (rule.auto_voice) for (let i = 0; i < project.scenes.length; i++) { const scene = project.scenes[i]; const result = await generateNarrationAudio(project.id, scene.id, scene.narration, project.language); scene.audio_url = result.audio_url; scene.audio_status = 'READY'; recordAsset(project.id, 'VOICE', result.audio_url, 'audio/wav', result.provider, scene.id); recordUsage({ project_id: project.id, job_id: job.id, provider: result.provider, operation: 'character', units: scene.narration.length, unit_name: 'characters' }); update(65 + Math.round((i + 1) / project.scenes.length * 15), `Giọng đọc ${i + 1}/${project.scenes.length}`); }
    projectStore.saveProject(project);
    if (rule.auto_render) { const url = await renderProjectVideo(project, (progress, message) => update(80 + Math.round(progress * .2), message)); project.final_video_url = url; project.status = 'REVIEW'; project.progress = 100; project.status_message = 'Automation hoàn tất, đang chờ người duyệt'; recordAsset(project.id, 'FINAL_VIDEO', url, 'video/mp4', 'ffmpeg'); }
    else { project.status = rule.auto_voice ? 'VOICE_READY' : rule.auto_video ? 'VIDEOS_READY' : rule.auto_image ? 'IMAGES_READY' : 'SCRIPT_READY'; }
    rule.last_project_id = project.id; rule.last_error = undefined; projectStore.saveAutomation(rule); projectStore.saveProject(project); update(100, 'Automation hoàn tất');
  });

  jobQueue.register('PUBLISH_SOCIAL', async ({ job, update }) => {
    const project = projectStore.getProject(job.project_id); if (!project) throw new NonRetryableJobError('Project not found');
    update(30, 'Đang chuẩn bị gói xuất bản'); const result = await publishProject(project, (job.payload?.platform as any) || 'Export Package');
    if (result.status === 'FAILED') throw new NonRetryableJobError(result.error_message || 'Publish failed'); update(100, 'Gói xuất bản đã sẵn sàng');
  });

  jobQueue.register('DUB_TRANSCRIBE', async ({job,update})=>{
    const item=projectStore.getDubbingProject(job.project_id);if(!item)throw new NonRetryableJobError('Dubbing project not found');
    item.status='TRANSCRIBING';item.progress=10;projectStore.saveDubbingProject(item);update(10,'Whisper đang nhận dạng lời nói');
    try{await transcribeVideo(item,(progress,message)=>{item.progress=progress;projectStore.saveDubbingProject(item);update(progress,message)});item.status='TRANSCRIPT_READY';item.progress=100;projectStore.saveDubbingProject(item);update(100,`Đã nhận dạng ${item.segments.length} đoạn`);}catch(error){item.status='FAILED';item.error_message=(error as Error).message;projectStore.saveDubbingProject(item);throw error;}
  });
  jobQueue.register('DUB_RENDER', async ({job,update})=>{
    const item=projectStore.getDubbingProject(job.project_id);if(!item)throw new NonRetryableJobError('Dubbing project not found');
    if(activeDubRenders.has(item.id))throw new NonRetryableJobError('Dự án này đã có một job xuất video đang chạy.');
    activeDubRenders.add(item.id);
    item.status=item.mode==='SUBTITLES'?'RENDERING':'GENERATING_VOICE';item.progress=5;item.error_message=undefined;projectStore.saveDubbingProject(item);
    try{item.output_video_url=await renderDub(item,(p,m)=>{item.status=p<70&&item.mode!=='SUBTITLES'?'GENERATING_VOICE':'RENDERING';item.progress=p;projectStore.saveDubbingProject(item);update(p,m)});item.status='COMPLETED';item.progress=100;item.error_message=undefined;projectStore.saveDubbingProject(item);}catch(error){item.status='FAILED';item.error_message=(error as Error).message;projectStore.saveDubbingProject(item);throw error;}finally{activeDubRenders.delete(item.id);}
  });
  jobQueue.register('DUB_SEGMENT_PREVIEW', async ({job,update})=>{
    const item=projectStore.getDubbingProject(job.project_id);
    const segment=item?.segments.find(candidate=>candidate.id===job.scene_id);
    if(!item||!segment)throw new NonRetryableJobError('Không tìm thấy project hoặc đoạn thoại để tạo giọng thử.');
    update(5,`Đang kiểm tra cache cho ${segment.id}`);
    await generateSegmentPreview(item,segment);
    projectStore.saveDubbingProject(item);
    update(100,`Đã cập nhật giọng thử ${segment.id}`);
  });
}

function isMp4(buffer: Buffer) {
  return buffer.length > 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
}

function decodeUploadName(value: string) {
  if (!/[ÃÂÆÐÑØÞ]/.test(value) && !value.includes('�')) return value;
  try {
    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    return decoded.includes('�') ? value : decoded;
  } catch {
    return value;
  }
}

function getImageProviderId() {
  return getImageProvider().id;
}

async function persistImageDataUrl(projectId: string, sceneId: string, url: string) {
  const match = url.match(/^data:([^;,]+)(;(base64|utf8))?,(.*)$/s);
  if (!match) return url;
  const mime = match[1];
  let extension = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : 'jpg';
  let contents = match[3] === 'base64' ? Buffer.from(match[4], 'base64') : Buffer.from(decodeURIComponent(match[4]), 'utf8');
  if (mime.includes('svg')) {
    contents = await sharp(contents).resize(1080, 1920).png().toBuffer();
    extension = 'png';
  }
  return saveProjectAsset(projectId, `${sceneId}-image.${extension}`, contents);
}

async function composeAndSaveThumbnail(seriesName:string,conceptId:string,imageUrl:string,headline:string,subheadline:string,accent?:string){
  let input:Buffer;
  const dataMatch=imageUrl.match(/^data:([^;,]+)(;(base64|utf8))?,(.*)$/s);
  if(dataMatch)input=dataMatch[3]==='base64'?Buffer.from(dataMatch[4],'base64'):Buffer.from(decodeURIComponent(dataMatch[4]),'utf8');
  else if(imageUrl.startsWith('/media/')){const local=resolveMediaUrl(imageUrl);if(!local)throw new Error('Ảnh thumbnail nằm ngoài storage.');input=await readFile(local);}
  else if(/^https?:\/\//i.test(imageUrl)){const response=await fetch(imageUrl,{signal:AbortSignal.timeout(30_000)});if(!response.ok)throw new Error(`Không tải được ảnh nền (${response.status}).`);input=Buffer.from(await response.arrayBuffer());}
  else throw new Error('Định dạng ảnh thumbnail không được hỗ trợ.');
  const lines=wrapThumbnailHeadline(headline,20).slice(0,3);const safeAccent=/^#[0-9a-f]{6}$/i.test(accent||'')?accent!:'#8B5CF6';
  const text=lines.map((line,index)=>`<text x="70" y="${430+index*82}" fill="white" stroke="#000" stroke-width="10" paint-order="stroke" font-family="Arial" font-size="72" font-weight="900">${escapeSvgText(line)}</text>`).join('');
  const subtitle=subheadline?`<text x="74" y="${455+lines.length*82}" fill="${safeAccent}" stroke="#000" stroke-width="5" paint-order="stroke" font-family="Arial" font-size="34" font-weight="700">${escapeSvgText(subheadline.slice(0,70))}</text>`:'';
  const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="35%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".88"/></linearGradient></defs><rect width="1280" height="720" fill="url(#shade)"/><rect x="45" y="390" width="12" height="255" rx="6" fill="${safeAccent}"/>${text}${subtitle}</svg>`);
  const output=await sharp(input).resize(1280,720,{fit:'cover'}).composite([{input:overlay}]).jpeg({quality:92}).toBuffer();
  const projectId=`series-thumb-${Buffer.from(seriesName,'utf8').toString('base64url').slice(0,40)}`;
  return saveProjectAsset(projectId,`${conceptId}.jpg`,output);
}

function wrapThumbnailHeadline(value:string,maxChars:number){
  const words=value.trim().split(/\s+/).filter(Boolean);const lines:string[]=[];let current='';
  for(const word of words){const next=current?`${current} ${word}`:word;if(next.length>maxChars&&current){lines.push(current);current=word}else current=next;}
  if(current)lines.push(current);return lines;
}
function escapeSvgText(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}

function imageMime(url: string) {
  return url.toLowerCase().endsWith('.png') ? 'image/png' : url.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
}

function recordAsset(
  projectId: string,
  type: MediaAsset['type'],
  url: string,
  mimeType: string,
  provider: string,
  sceneId?: string,
  metadata?: Record<string, unknown>
) {
  projectStore.saveAsset({
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    project_id: projectId,
    scene_id: sceneId,
    type,
    url,
    mime_type: mimeType,
    provider,
    metadata,
    created_at: new Date().toISOString(),
  });
}
