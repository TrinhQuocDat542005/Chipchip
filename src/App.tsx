import React, { useState, useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { Dashboard } from './components/Dashboard';
import { ProjectsLibrary } from './components/ProjectsLibrary';
import { CreateIdea } from './components/CreateIdea';
import { CreateScript } from './components/CreateScript';
import { SceneStudio } from './components/SceneStudio';
import { ReviewHub } from './components/ReviewHub';
import { AIProviders } from './components/AIProviders';
import { AutomationsManager } from './components/AutomationsManager';
import { RenderProgress } from './components/RenderProgress';
import { DubbingStudio } from './components/DubbingStudio';
import { SeriesHub } from './components/SeriesHub';
import { VideoProject, ProviderConfig, AutomationRule, Scene, PlatformType, GenerationJob } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch initial data from backend API
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers/status');
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    }
  };

  const fetchAutomations = async () => {
    try {
      const res = await fetch('/api/automations');
      if (res.ok) {
        const data = await res.json();
        setAutomations(data);
      }
    } catch (err) {
      console.error('Failed to fetch automations:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) setJobs(await res.json());
    } catch (err) { console.error('Failed to fetch jobs:', err); }
  };

  useEffect(() => {
    fetchProjects();
    fetchProviders();
    fetchAutomations();
    fetchJobs();
  }, []);

  useEffect(() => {
    const events = new EventSource('/api/events');
    let refreshTimer: number | undefined;
    events.addEventListener('job', () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void fetchProjects(), 150);
      void fetchJobs();
    });
    return () => { window.clearTimeout(refreshTimer); events.close(); };
  }, []);

  const submitJob = async (url: string) => {
    const response = await fetch(url, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not create generation job');
    const job = body.job as GenerationJob | undefined;
    if (!job) return;

    await new Promise<void>((resolve, reject) => {
      const events = new EventSource(`/api/jobs/${job.id}/events`);
      const timeout = window.setTimeout(() => {
        events.close();
        reject(new Error('Generation job timed out'));
      }, 15 * 60 * 1000);
      events.addEventListener('job', (event) => {
        const current = JSON.parse((event as MessageEvent).data) as GenerationJob;
        if (current.status === 'COMPLETED') {
          window.clearTimeout(timeout); events.close(); resolve();
        } else if (current.status === 'FAILED') {
          window.clearTimeout(timeout); events.close(); reject(new Error(current.error_message || 'Generation job failed'));
        }
      });
      events.onerror = () => {
        // EventSource reconnects automatically. The timeout remains the final safety net.
      };
    });
    await fetchProjects();
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const handleNavigate = (tab: string, projectId?: string) => {
    if (projectId) {
      setActiveProjectId(projectId);
    }
    setCurrentTab(tab);
  };

  const handleRetryJob = async (jobId: string) => {
    const response = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
    if (response.ok) await fetchJobs();
  };

  // 1. Create project from Idea topic & auto-trigger Gemini Script Generation
  const handleCreateIdea = async (data: {
    topic: string;
    platform: PlatformType;
    duration: '30 seconds' | '60 seconds' | '90 seconds';
    language: string;
    tone: string;
    visual_style_id: string;
  }) => {
    setLoading(true);
    try {
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!createRes.ok) throw new Error('Failed to create project');
      const newProj: VideoProject = await createRes.json();

      // Trigger Gemini script generation
      await submitJob(`/api/projects/${newProj.id}/generate-script?queue=true`);

      await fetchProjects();
      setActiveProjectId(newProj.id);
      setCurrentTab('script');
    } catch (err: any) {
      alert('Error creating video script: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Update script text fields
  const handleUpdateScript = async (updates: Partial<VideoProject>) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchProjects();
      }
    } catch (err) {
      console.error('Error updating script:', err);
    }
  };

  // 3. Approve script & auto generate images for all scenes
  const handleApproveScript = async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      // Trigger batch image generation for scenes
      await submitJob(`/api/projects/${activeProject.id}/generate-images?queue=true`);
      setCurrentTab('scene-studio');
    } catch (err) {
      console.error('Error approving script:', err);
    } finally {
      setLoading(false);
    }
  };

  // 4. Single Scene Update
  const handleUpdateScene = async (sceneId: string, updates: Partial<Scene>) => {
    try {
      const res = await fetch(`/api/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchProjects();
      }
    } catch (err) {
      console.error('Error updating scene:', err);
    }
  };

  // 5. Regenerate Single Scene Image
  const handleRegenerateSceneImage = async (sceneId: string) => {
    try {
      await submitJob(`/api/scenes/${sceneId}/generate-image?queue=true`);
    } catch (err) {
      console.error('Error regenerating scene image:', err);
    }
  };

  // 6. Generate Scene Video
  const handleGenerateSceneVideo = async (sceneId: string) => {
    try {
      await submitJob(`/api/scenes/${sceneId}/generate-video?queue=true`);
    } catch (err) {
      console.error('Error generating scene video:', err);
    }
  };

  const handleGenerateSceneVoice = async (sceneId: string) => {
    await submitJob(`/api/scenes/${sceneId}/generate-voice?queue=true`);
  };

  // 7. Upload Custom Video (Manual Fallback)
  const handleUploadSceneVideo = async (sceneId: string, video: File) => {
    try {
      const body = new FormData();
      body.append('video', video);
      const res = await fetch(`/api/scenes/${sceneId}/upload-video`, {
        method: 'POST',
        body,
      });
      if (res.ok) {
        await fetchProjects();
      } else {
        const result = await res.json().catch(() => ({}));
        alert(result.error || 'Video upload failed');
      }
    } catch (err) {
      console.error('Error uploading scene video:', err);
    }
  };

  // 8. Start Final Video Render Compilation
  const handleStartRender = async (projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentTab('render');
    try {
      const project = projects.find((item) => item.id === projectId);
      if (project?.scenes?.some((scene) => !scene.video_url)) {
        await submitJob(`/api/projects/${projectId}/generate-videos`);
      }
      await submitJob(`/api/projects/${projectId}/generate-voice?queue=true`);
      await submitJob(`/api/projects/${projectId}/render?queue=true`);
    } catch (err: any) {
      console.error('Error starting render:', err);
      alert(`Could not prepare voice and render: ${err.message}`);
      await fetchProjects();
      setCurrentTab('scene-studio');
    }
  };

  // 9. Approve Video
  const handleApproveVideo = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/approve`, { method: 'POST' });
      if (res.ok) {
        await fetchProjects();
        setCurrentTab('dashboard');
      }
    } catch (err) {
      console.error('Error approving video:', err);
    }
  };

  // 10. Reject Video
  const handleRejectVideo = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/reject`, { method: 'POST' });
      if (res.ok) {
        await fetchProjects();
        setCurrentTab('create');
      }
    } catch (err) {
      console.error('Error rejecting video:', err);
    }
  };

  const handleUploadMusic = async (projectId: string, music: File) => {
    const body = new FormData();
    body.append('music', music);
    const res = await fetch(`/api/projects/${projectId}/upload-music`, { method: 'POST', body });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      throw new Error(result.error || 'Music upload failed');
    }
    await fetchProjects();
  };

  const handleMusicVolume = async (projectId: string, volume: number) => {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bg_music_volume: volume }),
    });
    if (res.ok) await fetchProjects();
  };

  const handleRemoveMusic = async (projectId: string) => {
    const res = await fetch(`/api/projects/${projectId}/music`, { method: 'DELETE' });
    if (res.ok) await fetchProjects();
  };

  return (
    <AppShell
      currentTab={currentTab}
      onNavigate={handleNavigate}
      activeProjectTitle={activeProject?.title}
      activeProjectStatus={activeProject?.status}
    >
      {currentTab === 'dashboard' && (
        <Dashboard
          projects={projects}
          jobs={jobs}
          providers={providers}
          onRetryJob={handleRetryJob}
          onNavigate={handleNavigate}
          onSelectProject={(id) => setActiveProjectId(id)}
        />
      )}

      {currentTab === 'projects' && (
        <ProjectsLibrary
          projects={projects}
          onSelectProject={(id) => setActiveProjectId(id)}
          onNavigate={handleNavigate}
        />
      )}
      {currentTab === 'dubbing' && <DubbingStudio />}
      {currentTab === 'series-hub' && <SeriesHub />}

      {currentTab === 'create' && (
        <CreateIdea onGenerateScript={handleCreateIdea} loading={loading} />
      )}

      {currentTab === 'script' && activeProject && (
        <CreateScript
          project={activeProject}
          onUpdateScript={handleUpdateScript}
          onApproveScript={handleApproveScript}
          onRegenerateScript={() => {
            if (activeProject) {
              handleCreateIdea({
                topic: activeProject.topic,
                platform: activeProject.platform,
                duration: activeProject.duration,
                language: activeProject.language,
                tone: activeProject.tone,
                visual_style_id: activeProject.visual_style_id,
              });
            }
          }}
          loading={loading}
        />
      )}

      {currentTab === 'scene-studio' && activeProject && (
        <SceneStudio
          project={activeProject}
          onUpdateScene={handleUpdateScene}
          onRegenerateSceneImage={handleRegenerateSceneImage}
          onGenerateSceneVideo={handleGenerateSceneVideo}
          onUploadSceneVideo={handleUploadSceneVideo}
          onNavigate={(tab, projId) => {
            if (tab === 'render' && projId) {
              handleStartRender(projId);
            } else {
              handleNavigate(tab, projId);
            }
          }}
        />
      )}

      {currentTab === 'render' && activeProject && (
        <RenderProgress
          project={activeProject}
          onRenderComplete={() => {
            fetchProjects();
            setCurrentTab('review');
          }}
        />
      )}

      {(currentTab === 'review' || currentTab === 'review-hub') && activeProject && (
        <ReviewHub
          project={activeProject}
          onApprove={handleApproveVideo}
          onReject={handleRejectVideo}
          onNavigate={handleNavigate}
          onRenderAgain={handleStartRender}
          onUploadMusic={handleUploadMusic}
          onMusicVolume={handleMusicVolume}
          onUpdateProject={handleUpdateScript}
          onUpdateScene={handleUpdateScene}
          onRegenerateImage={handleRegenerateSceneImage}
          onRegenerateVoice={handleGenerateSceneVoice}
          onRemoveMusic={handleRemoveMusic}
        />
      )}

      {currentTab === 'providers' && <AIProviders providers={providers} onRefresh={fetchProviders} />}

      {currentTab === 'automations' && <AutomationsManager automations={automations} onRefresh={fetchAutomations} />}

      {currentTab === 'settings' && (
        <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn py-4">
          <h2 className="text-2xl font-bold text-white">Studio Workspace Settings</h2>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-[#262626]">
              <div>
                <h3 className="font-semibold text-white">Default Export Resolution</h3>
                <p className="text-xs text-[#cbc3d7]">1080x1920 9:16 Vertical HD</p>
              </div>
              <span className="font-mono text-xs bg-[#8B5CF6]/20 text-[#d0bcff] px-2.5 py-1 rounded border border-[#8B5CF6]/30">
                1080x1920
              </span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-[#262626]">
              <div>
                <h3 className="font-semibold text-white">Server-side FFmpeg Engine</h3>
                <p className="text-xs text-[#cbc3d7]">Burned-in ASS/SRT Subtitles + Wave Audio Mix</p>
              </div>
              <span className="font-mono text-xs bg-[#00a572]/20 text-[#4edea3] px-2.5 py-1 rounded border border-[#00a572]/30">
                ENABLED
              </span>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
