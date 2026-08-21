import { VideoProject, Scene, GenerationJob, ProviderConfig, AutomationRule, MediaAsset, UsageRecord, Publication, DubbingProject, ProjectSnapshot } from '../types';
import { DEFAULT_STYLE_PRESETS } from '../data/stylePresets';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// In-memory store initialized with realistic sample projects matching Stitch design
export class ProjectStore {
  private database: DatabaseSync;
  private projects: Map<string, VideoProject> = new Map();
  private jobs: Map<string, GenerationJob> = new Map();
  private providers: Map<string, ProviderConfig> = new Map();
  private automations: Map<string, AutomationRule> = new Map();
  private assets: Map<string, MediaAsset> = new Map();
  private usage: Map<string, UsageRecord> = new Map();
  private publications: Map<string, Publication> = new Map();
  private dubbingProjects: Map<string, DubbingProject> = new Map();

  constructor() {
    const databasePath = path.resolve(process.env.VIDEO_FACTORY_DB_PATH || path.join('data', 'video-factory.db'));
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, scene_id TEXT, type TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
      CREATE INDEX IF NOT EXISTS idx_assets_scene ON assets(scene_id);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_records (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS publications (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_publications_project ON publications(project_id);
      CREATE TABLE IF NOT EXISTS dubbing_projects (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS project_snapshots (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_snapshots_project ON project_snapshots(project_id);
    `);

    if (!this.loadPersistedData()) {
      this.initSampleData();
      this.persistAll();
    }
  }

  private loadPersistedData(): boolean {
    const projectRows = this.database.prepare('SELECT data FROM projects').all() as Array<{ data: string }>;
    if (!projectRows.length) return false;
    for (const row of projectRows) {
      const project = JSON.parse(row.data) as VideoProject;
      this.projects.set(project.id, project);
    }
    for (const row of this.database.prepare('SELECT data FROM jobs').all() as Array<{ data: string }>) {
      const job = JSON.parse(row.data) as GenerationJob;
      job.attempt_count ??= 0;
      job.max_attempts ??= 3;
      this.jobs.set(job.id, job);
    }
    for (const row of this.database.prepare('SELECT data FROM providers').all() as Array<{ data: string }>) {
      const provider = JSON.parse(row.data) as ProviderConfig;
      this.providers.set(provider.id, provider);
    }
    for (const row of this.database.prepare('SELECT data FROM automations').all() as Array<{ data: string }>) {
      const automation = JSON.parse(row.data) as AutomationRule;
      this.automations.set(automation.id, automation);
    }
    for (const row of this.database.prepare('SELECT data FROM assets').all() as Array<{ data: string }>) {
      const asset = JSON.parse(row.data) as MediaAsset;
      this.assets.set(asset.id, asset);
    }
    for (const row of this.database.prepare('SELECT data FROM usage_records').all() as Array<{ data: string }>) {
      const item = JSON.parse(row.data) as UsageRecord; this.usage.set(item.id, item);
    }
    for (const row of this.database.prepare('SELECT data FROM publications').all() as Array<{ data: string }>) {
      const item = JSON.parse(row.data) as Publication; this.publications.set(item.id, item);
    }
    for (const row of this.database.prepare('SELECT data FROM dubbing_projects').all() as Array<{ data: string }>) {
      const item = JSON.parse(row.data) as DubbingProject; this.dubbingProjects.set(item.id, item);
    }
    return true;
  }

  private persistAll() {
    for (const project of this.projects.values()) this.persist('projects', project.id, project);
    for (const job of this.jobs.values()) this.persist('jobs', job.id, job);
    for (const provider of this.providers.values()) this.persist('providers', provider.id, provider);
    for (const automation of this.automations.values()) this.persist('automations', automation.id, automation);
  }

  private persist(table: 'projects' | 'jobs' | 'providers' | 'automations', id: string, value: unknown) {
    this.database.prepare(
      `INSERT INTO ${table} (id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(id, JSON.stringify(value), new Date().toISOString());
  }

  private initSampleData() {
    // 1. Bermuda Triangle Mystery (Generating)
    const project1: VideoProject = {
      id: 'proj-bermuda-01',
      title: 'Bermuda Triangle Mystery',
      topic: 'The mysterious disappearances in the Bermuda Triangle and oceanic vortex theories.',
      platform: 'TikTok / Shorts (9:16)',
      duration: '60 seconds',
      language: 'English (US)',
      tone: 'Cinematic / Mysterious',
      aspect_ratio: '9:16',
      status: 'RENDERING',
      progress: 60,
      status_message: 'Rendering Scene 4/7...',
      visual_style_id: 'dark-mystery',
      visual_style: DEFAULT_STYLE_PRESETS[0],
      hook: 'What lies at the bottom of the Bermuda Triangle?',
      narration_body: 'For decades, planes and ships have vanished into thin air. Modern sonar technology has recently mapped a massive hexagonal magnetic anomaly lurking beneath the waves.',
      call_to_action: 'Follow for part 2 of deep ocean mysteries!',
      caption: 'The Bermuda Triangle Anomaly revealed 🌊 #BermudaTriangle #Mystery #DeepSea #AIVideo',
      hashtags: ['#BermudaTriangle', '#Mystery', '#Ocean', '#Shorts'],
      bg_music_name: 'Dark Atmospheric Synth',
      bg_music_volume: 0.35,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 60000 * 15).toISOString(),
      scenes: [
        {
          id: 'sc-b1',
          project_id: 'proj-bermuda-01',
          scene_number: 1,
          duration: 5,
          narration: 'What lies at the bottom of the Bermuda Triangle?',
          subtitle: 'What lies at the bottom of the Bermuda Triangle?',
          visual_description: 'Stormy ocean swirling around Bermuda Triangle with dark oppressive clouds pierced by greenish light.',
          image_prompt: 'A moody, cinematic vertical 9:16 frame depicting a stormy ocean swirling around the Bermuda Triangle. Dark, oppressive clouds dominate the sky, pierced by a single shaft of unnatural greenish light hitting the churning water. High contrast, photorealistic digital art style, deep oceanic blues and blacks.',
          video_prompt: 'Camera panning down into stormy waves with light shafts',
          image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
          image_status: 'READY',
          video_status: 'READY',
          audio_status: 'READY',
          motion_intensity: 'Medium',
          camera_movement: 'Pan Up (Ascend)',
        },
        {
          id: 'sc-b2',
          project_id: 'proj-bermuda-01',
          scene_number: 2,
          duration: 8,
          narration: 'For decades, planes and ships have vanished without a trace.',
          subtitle: 'Planes and ships vanished without a trace...',
          visual_description: 'Sunken ship silhouette resting on dark ocean floor covered in bioluminescent flora.',
          image_prompt: 'Hyper realistic 8k vertical 9:16 frame of an ancient sunken ship hull lying on deep ocean floor, illuminated by faint bioluminescence, deep dark teals, volumetric water atmosphere.',
          video_prompt: 'Slow camera tracking shot past barnacle-covered hull',
          image_url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80',
          image_status: 'READY',
          video_status: 'READY',
          audio_status: 'READY',
          motion_intensity: 'Low',
          camera_movement: 'Zoom In',
        },
        {
          id: 'sc-b3',
          project_id: 'proj-bermuda-01',
          scene_number: 3,
          duration: 10,
          narration: 'Sonar technology mapped a massive magnetic anomaly beneath the waves.',
          subtitle: 'Sonar mapped a massive magnetic anomaly...',
          visual_description: 'Futuristic sonar holographic map revealing underwater pyramid vortex.',
          image_prompt: 'Cyberpunk style sonar 3D holographic projection of underwater geometric structures, neon cyan lines, dark obsidian background, 9:16 aspect ratio',
          video_prompt: 'Hologram rotating 360 degrees in dark lab',
          image_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
          image_status: 'READY',
          video_status: 'READY',
          audio_status: 'READY',
          motion_intensity: 'High',
          camera_movement: 'Pan Left',
        },
        {
          id: 'sc-b4',
          project_id: 'proj-bermuda-01',
          scene_number: 4,
          duration: 7,
          narration: 'Follow for part 2 of deep ocean mysteries!',
          subtitle: 'Follow for part 2!',
          visual_description: 'Dramatic pull back view of ocean horizon with glowing storm energy.',
          image_prompt: 'Dramatic vertical artwork of endless ocean at night under starry sky with glowing vortex in center, 8k cinematic resolution, dark mystery aesthetic',
          video_prompt: 'Camera zoom out high into night sky',
          image_status: 'GENERATING',
          video_status: 'QUEUED',
          audio_status: 'READY',
          motion_intensity: 'Medium',
          camera_movement: 'Pan Up (Ascend)',
        },
      ],
    };

    // 2. Cyberpunk City Ambience (Needs Review)
    const project2: VideoProject = {
      id: 'proj-cyber-02',
      title: 'Cyberpunk City Ambience',
      topic: 'Life in a hyper-technological neon metropolis in the year 2099.',
      platform: 'TikTok / Shorts (9:16)',
      duration: '30 seconds',
      language: 'English (US)',
      tone: 'Cinematic / Mysterious',
      aspect_ratio: '9:16',
      status: 'REVIEW',
      progress: 100,
      status_message: 'Ready for human approval',
      visual_style_id: 'cyberpunk',
      visual_style: DEFAULT_STYLE_PRESETS[4],
      hook: 'The city never sleeps... and neither do the androids.',
      narration_body: 'Beneath the multi-tiered skyways of Neo-Tokyo, rain-soaked streets reflect thousands of glowing neon billboards.',
      call_to_action: 'Like and follow for daily sci-fi visual art!',
      caption: 'Neo-Tokyo 2099 🌆 #Cyberpunk #NeoTokyo #SciFi #Shorts',
      hashtags: ['#Cyberpunk', '#NeoTokyo', '#SciFi', '#Shorts'],
      bg_music_name: 'Synthwave Neon Rain',
      bg_music_volume: 0.4,
      created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 1).toISOString(),
      scenes: [
        {
          id: 'sc-c1',
          project_id: 'proj-cyber-02',
          scene_number: 1,
          duration: 4,
          narration: 'The city never sleeps...',
          subtitle: 'The city never sleeps...',
          visual_description: 'A vertical cinematic shot of a futuristic cyberpunk city street at night, neon lights reflecting on wet pavement.',
          image_prompt: 'Establishing shot of futuristic cyberpunk street in rain, neon pink and cyan signs, reflection in wet pavement, 9:16 vertical frame, hyper detailed 8k',
          video_prompt: 'Smooth camera glide forward over wet reflective street',
          image_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
          image_status: 'READY',
          video_status: 'READY',
          audio_status: 'READY',
          motion_intensity: 'Medium',
          camera_movement: 'Zoom In',
        },
        {
          id: 'sc-c2',
          project_id: 'proj-cyber-02',
          scene_number: 2,
          duration: 6,
          narration: 'Figures in transparent coats walk past holographic street vendors.',
          subtitle: 'Transparent coats past holographic vendors...',
          visual_description: 'Hooded figure walking through rainy alleyway past neon ramen stalls.',
          image_prompt: 'Close up vertical 9:16 shot of hooded figure in transparent rain jacket walking down narrow cyberpunk alley, neon ramen stall in background, shallow depth of field',
          video_prompt: 'Slow motion tracking shot behind character',
          image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
          image_status: 'READY',
          video_status: 'READY',
          audio_status: 'READY',
          motion_intensity: 'Low',
          camera_movement: 'Static',
        },
      ],
    };

    // 3. Top 10 AI Tools 2024 (Draft)
    const project3: VideoProject = {
      id: 'proj-aitools-03',
      title: 'Top 10 AI Tools 2026',
      topic: 'The most powerful AI tools transforming video, music, and code generation this year.',
      platform: 'YouTube (16:9)',
      duration: '60 seconds',
      language: 'English (US)',
      tone: 'Educational / Professional',
      aspect_ratio: '16:9',
      status: 'DRAFT',
      progress: 0,
      status_message: 'Draft project created',
      visual_style_id: 'documentary',
      visual_style: DEFAULT_STYLE_PRESETS[2],
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    };

    // 4. Atlantis The Sunken City (Script Ready)
    const project4: VideoProject = {
      id: 'proj-atlantis-04',
      title: 'The Sunken City of Atlantis',
      topic: 'The lost city of Atlantis and the secrets of the deep ocean.',
      platform: 'TikTok / Shorts (9:16)',
      duration: '60 seconds',
      language: 'English (US)',
      tone: 'Cinematic / Mysterious',
      aspect_ratio: '9:16',
      status: 'SCRIPT_READY',
      progress: 30,
      status_message: 'Script approved, ready for visual style generation',
      visual_style_id: 'ancient-history',
      visual_style: DEFAULT_STYLE_PRESETS[5],
      hook: 'Imagine a city, entirely submerged, where glowing coral replaces streetlights.',
      narration_body: 'This is Atlantis, not a myth, but a simulated recreation of what could have been. We are diving deep into the architectural marvels and aqueducts.',
      call_to_action: 'Subscribe and dive in with us next time!',
      caption: 'The secrets of Atlantis revealed 🏛️ #Atlantis #AncientHistory #Shorts',
      hashtags: ['#Atlantis', '#History', '#Ocean', '#AI'],
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      scenes: [
        {
          id: 'sc-a1',
          project_id: 'proj-atlantis-04',
          scene_number: 1,
          duration: 5,
          narration: 'Imagine a city, entirely submerged, where glowing coral replaces streetlights...',
          subtitle: 'Imagine a city, entirely submerged...',
          visual_description: 'Dramatic drone descent into dark blue ocean water revealing faint glowing lights of structures below.',
          image_prompt: 'Dramatic vertical drone descent into deep blue ocean water, revealing faint bioluminescent ancient Greek-style city ruins, 8k resolution 9:16',
          video_prompt: 'Pan down into ocean abyss',
          image_status: 'PENDING',
          video_status: 'PENDING',
          audio_status: 'PENDING',
          motion_intensity: 'Medium',
          camera_movement: 'Pan Up (Ascend)',
        },
        {
          id: 'sc-a2',
          project_id: 'proj-atlantis-04',
          scene_number: 2,
          duration: 7,
          narration: 'Bioluminescent coral grows over marble columns, illuminating history.',
          subtitle: 'Glowing coral over ancient columns...',
          visual_description: 'Close up of coral growing over Greek column.',
          image_prompt: 'Close up of bioluminescent coral growing over ancient Greek-style columns under water, 9:16 vertical frame, hyper detailed 8k',
          video_prompt: 'Slow orbit around column',
          image_status: 'PENDING',
          video_status: 'PENDING',
          audio_status: 'PENDING',
          motion_intensity: 'Low',
          camera_movement: 'Zoom In',
        },
      ],
    };

    this.projects.set(project1.id, project1);
    this.projects.set(project2.id, project2);
    this.projects.set(project3.id, project3);
    this.projects.set(project4.id, project4);

    // Initial Providers
    const prov1: ProviderConfig = {
      id: 'prov-gemini',
      category: 'LLM',
      name: 'Gemini 2.5 Flash / Pro',
      model: 'gemini-2.5-flash',
      status: 'Configured',
      masked_key: '••••••••••••••••3A19',
      usage_info: 'Scripting, Prompt Synthesis, JSON Mode',
      tokens_used: 4200000,
      tokens_limit: 10000000,
    };
    const prov2: ProviderConfig = {
      id: 'prov-imagen',
      category: 'Image',
      name: 'Imagen 3 / Flux.1',
      model: 'imagen-3.0-generate-002',
      status: 'Configured',
      masked_key: '••••••••••••••••8F92',
      usage_info: '9:16 Scene Concept Art & Frame Generation',
      tokens_used: 1250,
      tokens_limit: 5000,
    };
    const prov3: ProviderConfig = {
      id: 'prov-kling',
      category: 'Video',
      name: 'Manual Video Provider (Fallback)',
      model: 'Manual Clip Upload & Motion',
      status: 'Active',
      masked_key: 'AUTOMATED_FALLBACK',
      usage_info: 'Prompt Copy + Drag-and-Drop Video Fallback',
    };
    const prov4: ProviderConfig = {
      id: 'prov-vieneu',
      category: 'TTS',
      name: 'VieNeu-TTS Local',
      model: 'VieNeu-TTS-v2 (CPU/GGUF)',
      status: 'Configured',
      masked_key: 'NO_API_KEY_REQUIRED',
      usage_info: 'Local Vietnamese narration; ElevenLabs remains an optional future adapter',
    };

    this.providers.set(prov1.id, prov1);
    this.providers.set(prov2.id, prov2);
    this.providers.set(prov3.id, prov3);
    this.providers.set(prov4.id, prov4);

    // Initial Automation Rule
    const rule1: AutomationRule = {
      id: 'rule-daily-mysteries',
      name: 'Daily Deep Sea Mysteries',
      niche: 'Deep Ocean & Ancient Mysteries',
      frequency: 'Daily',
      language: 'English (US)',
      duration: '60 seconds',
      content_style: 'Cinematic Dark Mystery',
      auto_script: true,
      auto_image: true,
      auto_video: true,
      auto_voice: true,
      auto_render: true,
      require_review: true,
      status: 'Active',
      last_run: '2026-08-10T18:00:00.000Z',
      next_run: '2026-08-11T18:00:00.000Z',
    };

    this.automations.set(rule1.id, rule1);
  }

  // Project Methods
  public getAllProjects(): VideoProject[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  public getProject(id: string): VideoProject | undefined {
    return this.projects.get(id);
  }

  public saveProject(project: VideoProject): VideoProject {
    project.updated_at = new Date().toISOString();
    this.projects.set(project.id, project);
    this.persist('projects', project.id, project);
    return project;
  }

  public deleteProject(id: string): boolean {
    const deleted = this.projects.delete(id);
    this.database.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return deleted;
  }

  // Jobs
  public getJob(id: string): GenerationJob | undefined {
    return this.jobs.get(id);
  }

  public getAllJobs(): GenerationJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }

  public getProjectJobs(projectId: string): GenerationJob[] {
    return this.getAllJobs().filter((job) => job.project_id === projectId);
  }

  public getRunnableJobs(): GenerationJob[] {
    const now = Date.now();
    return this.getAllJobs().filter((job) =>
      job.status === 'PENDING' && (!job.next_attempt_at || new Date(job.next_attempt_at).getTime() <= now)
    ).reverse();
  }

  public recoverInterruptedJobs() {
    for (const job of this.jobs.values()) {
      if (job.status === 'RUNNING') {
        job.status = 'PENDING';
        job.error_message = 'Worker restarted; job safely requeued';
        this.saveJob(job);
      }
    }
  }

  public saveJob(job: GenerationJob): GenerationJob {
    this.jobs.set(job.id, job);
    this.persist('jobs', job.id, job);
    return job;
  }

  // Providers
  public getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  // Automations
  public getAllAutomations(): AutomationRule[] {
    return Array.from(this.automations.values());
  }

  public saveAutomation(rule: AutomationRule): AutomationRule {
    this.automations.set(rule.id, rule);
    this.persist('automations', rule.id, rule);
    return rule;
  }

  public getAutomation(id: string) { return this.automations.get(id); }
  public deleteAutomation(id: string) {
    const deleted = this.automations.delete(id);
    this.database.prepare('DELETE FROM automations WHERE id = ?').run(id);
    return deleted;
  }

  public saveUsage(record: UsageRecord) {
    this.usage.set(record.id, record);
    this.database.prepare('INSERT INTO usage_records (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.id, JSON.stringify(record), record.created_at);
    return record;
  }
  public getUsageRecords() { return Array.from(this.usage.values()).sort((a,b) => b.created_at.localeCompare(a.created_at)); }

  public savePublication(item: Publication) {
    this.publications.set(item.id, item);
    this.database.prepare('INSERT INTO publications (id, project_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(item.id, item.project_id, JSON.stringify(item), item.updated_at);
    return item;
  }
  public getPublication(id: string) { return this.publications.get(id); }
  public getPublications(projectId?: string) {
    return Array.from(this.publications.values()).filter(item => !projectId || item.project_id === projectId).sort((a,b) => b.created_at.localeCompare(a.created_at));
  }

  public saveDubbingProject(item: DubbingProject) {
    const updatedAt = new Date().toISOString();
    const serialized = JSON.stringify({ ...item, updated_at: updatedAt });
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('INSERT INTO dubbing_projects (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(item.id, serialized, updatedAt);
      this.database.exec('COMMIT');
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch { /* Preserve the original write error. */ }
      throw error;
    }
    item.updated_at = updatedAt;
    this.dubbingProjects.set(item.id, item);
    return item;
  }
  public getDubbingProject(id: string) { return this.dubbingProjects.get(id); }
  public getDubbingProjects() { return Array.from(this.dubbingProjects.values()).sort((a,b) => b.created_at.localeCompare(a.created_at)); }
  public deleteDubbingProject(id: string) { const ok=this.dubbingProjects.delete(id); this.database.prepare('DELETE FROM dubbing_projects WHERE id=?').run(id); this.database.prepare('DELETE FROM project_snapshots WHERE project_id=?').run(id); return ok; }

  public createSnapshot(projectId: string, name: string, snapshotType: 'MANUAL' | 'PRE_ASR' | 'PRE_TRANSLATE' | 'PRE_VOICEGEN' = 'MANUAL'): ProjectSnapshot | null {
    const project = this.getDubbingProject(projectId);
    if (!project) return null;
    const snapshot: ProjectSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      project_id: projectId,
      name,
      snapshot_type: snapshotType,
      data: JSON.parse(JSON.stringify(project)),
      created_at: new Date().toISOString(),
    };
    this.database.prepare(
      'INSERT INTO project_snapshots (id, project_id, name, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(snapshot.id, snapshot.project_id, snapshot.name, snapshot.snapshot_type, JSON.stringify(snapshot.data), snapshot.created_at);
    
    // Prune old snapshots if more than 10 for this project
    const all = this.getSnapshots(projectId);
    if (all.length > 10) {
      const toDelete = all.slice(10);
      for (const item of toDelete) {
        this.database.prepare('DELETE FROM project_snapshots WHERE id=?').run(item.id);
      }
    }
    return snapshot;
  }

  public getSnapshots(projectId: string): ProjectSnapshot[] {
    const rows = this.database.prepare(
      'SELECT id, project_id, name, type, data, created_at FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as Array<{ id: string; project_id: string; name: string; type: string; data: string; created_at: string }>;
    return rows.map(r => ({
      id: r.id,
      project_id: r.project_id,
      name: r.name,
      snapshot_type: r.type as any,
      data: JSON.parse(r.data),
      created_at: r.created_at,
    }));
  }

  public restoreSnapshot(projectId: string, snapshotId: string): DubbingProject | null {
    const row = this.database.prepare(
      'SELECT data FROM project_snapshots WHERE id = ? AND project_id = ?'
    ).get(snapshotId, projectId) as { data: string } | undefined;
    if (!row) return null;
    const restoredData = JSON.parse(row.data) as DubbingProject;
    restoredData.updated_at = new Date().toISOString();
    this.saveDubbingProject(restoredData);
    return restoredData;
  }

  public deleteSnapshot(snapshotId: string): boolean {
    this.database.prepare('DELETE FROM project_snapshots WHERE id = ?').run(snapshotId);
    return true;
  }

  public saveAsset(asset: MediaAsset): MediaAsset {
    this.assets.set(asset.id, asset);
    this.database.prepare(
      `INSERT INTO assets (id, project_id, scene_id, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, type = excluded.type`
    ).run(asset.id, asset.project_id, asset.scene_id || null, asset.type, JSON.stringify(asset), asset.created_at);
    return asset;
  }

  public getProjectAssets(projectId: string): MediaAsset[] {
    return Array.from(this.assets.values()).filter((asset) => asset.project_id === projectId);
  }

  public getSetting(key: string): string | undefined {
    const row = this.database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  public setSetting(key: string, value: string) {
    this.database.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, value);
  }

  public getSettingsByPrefix(prefix: string): Array<{ key:string; value:string }> {
    return this.database.prepare('SELECT key, value FROM settings WHERE key LIKE ? ORDER BY key').all(`${prefix}%`) as Array<{ key:string; value:string }>;
  }

  public close() {
    this.database.close();
  }
}

export const projectStore = new ProjectStore();
