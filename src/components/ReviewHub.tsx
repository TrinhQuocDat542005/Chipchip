import React, { useState } from 'react';
import { Scene, VideoProject } from '../types';

interface ReviewHubProps {
  project: VideoProject;
  onApprove: (projectId: string) => void;
  onReject: (projectId: string) => void;
  onNavigate: (tab: string, projectId?: string) => void;
  onRenderAgain: (projectId: string) => void;
  onUploadMusic: (projectId: string, music: File) => Promise<void>;
  onMusicVolume: (projectId: string, volume: number) => void;
  onUpdateProject: (updates: Partial<VideoProject>) => void;
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  onRegenerateImage: (sceneId: string) => void;
  onRegenerateVoice: (sceneId: string) => Promise<void>;
  onRemoveMusic: (projectId: string) => void;
}

export const ReviewHub: React.FC<ReviewHubProps> = ({
  project, onApprove, onReject, onNavigate, onRenderAgain, onUploadMusic, onMusicVolume,
  onUpdateProject, onUpdateScene, onRegenerateImage, onRegenerateVoice,
  onRemoveMusic,
}) => {
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');
  const fallbackImage = project.scenes?.[0]?.image_url ||
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80';
  const hasFinalVideo = Boolean(project.final_video_url?.toLowerCase().includes('.mp4'));

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#262626] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#4edea3]/20 text-[#4edea3] font-mono text-[10px] px-2 py-0.5 rounded border border-[#4edea3]/30">
              AWAITING HUMAN APPROVAL
            </span>
          </div>
          <input
            defaultValue={project.title}
            onBlur={(event) => onUpdateProject({ title: event.target.value.trim() || project.title })}
            className="text-3xl font-bold text-white tracking-tight bg-transparent border-b border-transparent hover:border-[#525252] focus:border-[#8B5CF6] outline-none max-w-full"
            aria-label="Tiêu đề video"
          />
          <p className="text-xs font-mono text-[#cbc3d7] mt-1">Platform: {project.platform} • Duration: 00:45</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onReject(project.id)}
            className="px-4 py-2 rounded-lg border border-[#525252] text-white font-mono text-xs hover:bg-[#201f1f] transition-colors"
          >
            Reject & Edit
          </button>
          {project.final_video_url && (
            <a
              href={project.final_video_url}
              download={`${project.title.replace(/[^a-zA-Z0-9-_]+/g, '-')}.mp4`}
              className="px-4 py-2 rounded-lg border border-[#8B5CF6] text-[#d0bcff] font-mono text-xs hover:bg-[#8B5CF6]/10 transition-colors"
            >
              Tải MP4
            </a>
          )}
          <button
            onClick={() => onApprove(project.id)}
            className="px-6 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#7c4dff] text-white font-mono text-xs font-semibold shadow-lg shadow-[#8B5CF6]/30 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">check_circle</span>
            Approve & Export MP4
          </button>
          {project.final_video_url && <button disabled={publishing} onClick={async () => {
            setPublishing(true); setPublishMessage('');
            try { const response = await fetch(`/api/projects/${project.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'Export Package' }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error_message || body.error); setPublishMessage('Gói đăng bài đã sẵn sàng'); }
            catch (error) { setPublishMessage((error as Error).message); } finally { setPublishing(false); }
          }} className="px-4 py-2 rounded-lg border border-[#4edea3]/50 text-[#4edea3] font-mono text-xs disabled:opacity-50">{publishing ? 'Đang chuẩn bị…' : 'Chuẩn bị đăng'}</button>}
        </div>
      </div>
      {publishMessage && <div className="text-xs text-[#4edea3] -mt-5 text-right">{publishMessage}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: 9:16 Vertical Video Player (5 cols) */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[360px] aspect-[9/16] bg-[#141414] rounded-xl overflow-hidden border border-[#262626] shadow-2xl relative flex flex-col justify-between">
            {hasFinalVideo ? (
              <video src={project.final_video_url} poster={fallbackImage} controls playsInline className="w-full h-full object-cover absolute inset-0" />
            ) : (
              <img src={fallbackImage} alt={project.title} className="w-full h-full object-cover absolute inset-0" />
            )}
            {!hasFinalVideo && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30"></div>}

            <div className="relative z-10 p-4 flex justify-between items-center">
              <span className="font-mono text-[10px] bg-black/60 px-2 py-0.5 rounded text-white border border-[#262626]">
                9:16 FINAL RENDER
              </span>
              <span className="material-symbols-outlined text-white">hd</span>
            </div>

            {/* Subtitle Burn Preview */}
            {!hasFinalVideo && <div className="relative z-10 p-6 text-center">
              <p className="text-white font-bold text-base bg-black/60 py-1.5 px-3 rounded-lg backdrop-blur-xs inline-block">
                "{project.hook || project.scenes?.[0]?.narration}"
              </p>
            </div>}
          </div>
        </div>

        {/* Right: Metadata, Caption, Hashtags & Scenes Strip (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Metadata Card */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-4">
            <h3 className="font-mono text-xs text-[#cbc3d7] uppercase tracking-wider">Social Copy & Metadata</h3>

            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-[#cbc3d7] uppercase block mb-1">Generated Caption</label>
                <textarea
                  defaultValue={project.caption || ''}
                  onBlur={(event) => onUpdateProject({ caption: event.target.value })}
                  rows={3}
                  className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-xs text-white outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] text-[#cbc3d7] uppercase block mb-1">Hashtags</label>
                <input
                  defaultValue={(project.hashtags || []).join(' ')}
                  onBlur={(event) => onUpdateProject({ hashtags: event.target.value.split(/[\s,]+/).filter(Boolean).map((tag) => tag.startsWith('#') ? tag : `#${tag}`) })}
                  className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-xs text-[#d0bcff] outline-none focus:border-[#8B5CF6]"
                  placeholder="#VideoAI #Shorts"
                />
              </div>
            </div>
          </div>

          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-mono text-xs text-[#cbc3d7] uppercase tracking-wider">Nhạc nền</h3>
                <p className="text-xs text-white mt-1">{project.bg_music_name || 'Chưa chọn nhạc nền'}</p>
              </div>
              <div className="flex gap-2">
              {project.bg_music_url && <button onClick={() => onRemoveMusic(project.id)} className="px-3 py-2 rounded-md border border-red-500/40 text-xs text-red-300">Xóa nhạc</button>}
              <label className="cursor-pointer px-3 py-2 rounded-md border border-[#525252] text-xs text-white hover:bg-[#201f1f]">
                Chọn MP3/WAV
                <input
                  type="file"
                  accept="audio/mpeg,audio/wav,.mp3,.wav"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try { await onUploadMusic(project.id, file); }
                    catch (error) { alert((error as Error).message); }
                    event.target.value = '';
                  }}
                />
              </label>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-[10px] text-[#cbc3d7]">
                <span>Âm lượng nhạc</span>
                <span>{Math.round((project.bg_music_volume ?? 0.2) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.6"
                step="0.05"
                value={project.bg_music_volume ?? 0.2}
                onChange={(event) => onMusicVolume(project.id, Number(event.target.value))}
                className="w-full accent-[#8B5CF6]"
              />
            </div>
            <button
              onClick={() => onRenderAgain(project.id)}
              className="w-full bg-[#2a2a2a] hover:bg-[#353534] border border-[#494454] text-white py-2.5 rounded-md font-mono text-xs"
            >
              Kết xuất lại với thiết lập mới
            </button>
          </div>

          {/* Scenes Strip */}
          <div className="space-y-3">
            <h3 className="font-mono text-xs text-[#cbc3d7] uppercase tracking-wider">Scene Breakdown Strip</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {project.scenes?.map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => onNavigate('scene-studio', project.id)}
                  className="bg-[#141414] border border-[#262626] rounded-lg p-2 space-y-1.5 cursor-pointer hover:border-[#8B5CF6] transition-all"
                >
                  <div className="aspect-[9/16] bg-[#0e0e0e] rounded overflow-hidden">
                    <img src={sc.image_url || fallbackImage} alt={`Scene ${sc.scene_number}`} className="w-full h-full object-cover" />
                  </div>
                  <span className="font-mono text-[10px] text-[#cbc3d7] block truncate">
                    Scene {sc.scene_number} ({sc.duration}s)
                  </span>
                  <textarea
                    defaultValue={sc.subtitle}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => onUpdateScene(sc.id, { subtitle: event.target.value })}
                    rows={2}
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded p-1.5 text-[10px] text-white outline-none focus:border-[#8B5CF6]"
                    aria-label={`Subtitle scene ${sc.scene_number}`}
                  />
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={(event) => { event.stopPropagation(); onRegenerateImage(sc.id); }}
                      className="text-[9px] py-1 rounded bg-[#2a2a2a] text-white"
                    >Ảnh mới</button>
                    <button
                      onClick={async (event) => {
                        event.stopPropagation();
                        try { await onRegenerateVoice(sc.id); }
                        catch (error) { alert((error as Error).message); }
                      }}
                      className="text-[9px] py-1 rounded bg-[#2a2a2a] text-white"
                    >Giọng mới</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
