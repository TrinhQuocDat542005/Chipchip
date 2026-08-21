import React, { useState, useEffect } from 'react';
import { VideoProject } from '../types';

interface RenderProgressProps {
  project: VideoProject;
  onRenderComplete: () => void;
}

export const RenderProgress: React.FC<RenderProgressProps> = ({ project, onRenderComplete }) => {
  const [progress, setProgress] = useState(project.progress || 80);
  const [stage, setStage] = useState(project.status_message || 'Preparing render job...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}`);
        if (!response.ok) throw new Error('Could not read render status');
        const current: VideoProject = await response.json();
        if (!active) return;
        setProgress(current.progress);
        setStage(current.status_message || 'Rendering...');
        if (current.status === 'REVIEW') {
          active = false;
          onRenderComplete();
        } else if (current.status === 'FAILED') {
          active = false;
          setError(current.status_message || 'Render failed');
        }
      } catch (requestError) {
        if (active) setError((requestError as Error).message);
      }
    };
    void refresh();
    const events = new EventSource('/api/events');
    events.addEventListener('job', (event) => {
      const job = JSON.parse((event as MessageEvent).data) as { project_id?: string };
      if (job.project_id === project.id) void refresh();
    });

    return () => { active = false; events.close(); };
  }, [project.id, onRenderComplete]);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn py-8 text-center">
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-8 space-y-8 shadow-2xl">
        <div>
          <div className="w-16 h-16 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6] text-[#d0bcff] flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl animate-spin">movie</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Rendering 9:16 Final Video</h2>
          <p className="text-xs font-mono text-[#cbc3d7] mt-1">{stage}</p>
          {error && <p className="text-xs font-mono text-red-400 mt-3">{error}</p>}
        </div>

        {/* Progress Bar */}
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex justify-between font-mono text-xs text-[#cbc3d7]">
            <span>FFmpeg Composition</span>
            <span className="text-[#d0bcff] font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-[#0e0e0e] h-3 rounded-full overflow-hidden border border-[#262626]">
            <div
              className="bg-[#8B5CF6] h-full rounded-full transition-all duration-300 shadow-lg shadow-[#8B5CF6]/50"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Multi Stage Checklist */}
        <div className="max-w-md mx-auto space-y-2 text-left bg-[#1c1b1b] border border-[#262626] p-4 rounded-lg font-mono text-xs">
          <div className="flex items-center gap-2 text-[#4edea3]">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>Gemini Script & Hook Generation</span>
          </div>
          <div className="flex items-center gap-2 text-[#4edea3]">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>Imagen 3 Visual Frame Synthesis</span>
          </div>
          <div className="flex items-center gap-2 text-[#4edea3]">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>TTS Voice Narration Audio Tracks</span>
          </div>
          <div className={`flex items-center gap-2 ${progress >= 95 ? 'text-[#4edea3]' : 'text-[#d0bcff]'}`}>
            <span className={`material-symbols-outlined text-sm ${progress < 95 ? 'animate-spin' : ''}`}>
              {progress >= 95 ? 'check_circle' : 'sync'}
            </span>
            <span>9:16 Subtitle Burn & MP4 Video Assembly</span>
          </div>
        </div>
      </div>
    </div>
  );
};
