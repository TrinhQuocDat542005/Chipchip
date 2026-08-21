import React, { useState } from 'react';
import { VideoProject, Scene } from '../types';

interface SceneStudioProps {
  project: VideoProject;
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  onRegenerateSceneImage: (sceneId: string) => void;
  onGenerateSceneVideo: (sceneId: string) => void;
  onUploadSceneVideo: (sceneId: string, video: File) => void;
  onNavigate: (tab: string, projectId?: string) => void;
}

export const SceneStudio: React.FC<SceneStudioProps> = ({
  project,
  onUpdateScene,
  onRegenerateSceneImage,
  onGenerateSceneVideo,
  onUploadSceneVideo,
  onNavigate,
}) => {
  const scenes = project.scenes || [];
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    scenes[0]?.id || ''
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'media' | 'voice' | 'subtitles'>('media');

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) || scenes[0];

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col md:flex-row overflow-hidden bg-[#0A0A0A] -m-4 md:-m-8">
      {/* 1. Left Timeline Sidebar (Scenes List) */}
      <div className="w-full md:w-64 bg-[#141414] border-r border-[#262626] flex flex-col h-auto md:h-full overflow-y-auto p-4 gap-4 shrink-0">
        <div className="flex justify-between items-center mb-1">
          <h2 className="font-mono text-xs text-[#cbc3d7] uppercase tracking-wider font-semibold">Scenes Timeline</h2>
          <span className="font-mono text-[10px] text-[#8B5CF6]">{scenes.length} Scenes</span>
        </div>

        <div className="space-y-3">
          {scenes.map((sc) => {
            const isSelected = sc.id === selectedSceneId;
            const isRendering = sc.image_status === 'GENERATING' || sc.video_status === 'GENERATING';

            return (
              <div
                key={sc.id}
                onClick={() => setSelectedSceneId(sc.id)}
                className={`bg-[#1c1b1b] rounded-lg p-2.5 flex gap-3 cursor-pointer transition-all border ${
                  isSelected
                    ? 'border-[#8B5CF6] ring-1 ring-[#8B5CF6] bg-[#2a2a2a]'
                    : 'border-transparent hover:bg-[#201f1f]'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-16 h-24 bg-[#0e0e0e] rounded overflow-hidden shrink-0 relative border border-[#262626] flex items-center justify-center">
                  {sc.image_url ? (
                    <img src={sc.image_url} alt={`Scene ${sc.scene_number}`} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[#958ea0]">image</span>
                  )}

                  {isRendering && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#d0bcff] text-base animate-spin">
                        progress_activity
                      </span>
                    </div>
                  )}

                  <div className="absolute bottom-1 right-1 bg-black/80 px-1 rounded font-mono text-[9px] text-white">
                    {sc.duration}s
                  </div>
                </div>

                {/* Details */}
                <div className="flex flex-col py-0.5 justify-between flex-1 truncate">
                  <div>
                    <span className="font-mono text-xs font-bold text-white block">Scene {sc.scene_number}</span>
                    <p className="text-[10px] text-[#cbc3d7] line-clamp-2 mt-0.5">{sc.narration}</p>
                  </div>

                  <div className="mt-2">
                    {sc.image_status === 'READY' ? (
                      <div className="flex items-center gap-1 text-[#4edea3]">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        <span className="font-mono text-[10px]">Ready</span>
                      </div>
                    ) : isRendering ? (
                      <div className="flex items-center gap-1 text-[#3B82F6]">
                        <span className="material-symbols-outlined text-xs animate-spin">autorenew</span>
                        <span className="font-mono text-[10px]">Generating...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[#958ea0]">
                        <span className="material-symbols-outlined text-xs">schedule</span>
                        <span className="font-mono text-[10px]">Pending</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => {
            const newScene: Scene = {
              id: `sc-${project.id}-${scenes.length + 1}`,
              project_id: project.id,
              scene_number: scenes.length + 1,
              duration: 5,
              narration: 'New scene narration snippet...',
              subtitle: 'New scene snippet...',
              visual_description: 'Cinematic visual scene concept...',
              image_prompt: `Detailed 9:16 vertical scene artwork for ${project.topic}, 8k cinematic resolution`,
              video_prompt: 'Slow camera pan',
              image_status: 'PENDING',
              video_status: 'PENDING',
              audio_status: 'PENDING',
              motion_intensity: 'Medium',
              camera_movement: 'Zoom In',
            };
            onUpdateScene(newScene.id, newScene);
          }}
          className="w-full border border-dashed border-[#525252] text-[#cbc3d7] hover:text-white hover:border-[#958ea0] py-2.5 rounded-lg flex items-center justify-center gap-2 mt-2 transition-colors font-mono text-xs"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Add Scene
        </button>
      </div>

      {/* 2. Central Video Canvas Player (Center Pane) */}
      <div className="flex-1 flex flex-col relative items-center justify-center p-6 bg-[#0A0A0A] overflow-y-auto">
        {selectedScene ? (
          <div className="w-full max-w-[380px] aspect-[9/16] bg-[#141414] rounded-xl overflow-hidden border border-[#262626] shadow-2xl relative flex flex-col justify-between">
            {/* Background preview image */}
            {selectedScene.video_url?.toLowerCase().includes('.mp4') ? (
              <video
                src={selectedScene.video_url}
                poster={selectedScene.image_url}
                controls
                playsInline
                className="w-full h-full object-cover absolute inset-0"
              />
            ) : selectedScene.image_url ? (
              <img
                src={selectedScene.image_url}
                alt={`Scene ${selectedScene.scene_number}`}
                className="w-full h-full object-cover absolute inset-0"
              />
            ) : (
              <div className="w-full h-full bg-[#1c1b1b] flex flex-col items-center justify-center text-[#958ea0]">
                <span className="material-symbols-outlined text-4xl mb-2">movie</span>
                <p className="text-xs font-mono">No Image Generated Yet</p>
              </div>
            )}

            {/* Rendering Overlay */}
            {(selectedScene.image_status === 'GENERATING' || selectedScene.video_status === 'GENERATING') && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="w-12 h-12 rounded-full border-4 border-[#262626] border-t-[#8B5CF6] animate-spin mb-3"></div>
                <div className="font-mono text-xs text-white font-bold">Rendering Scene {selectedScene.scene_number}...</div>
                <div className="font-mono text-[10px] text-[#cbc3d7] mt-1">Synthesizing visual frames (80%)</div>
              </div>
            )}

            {/* Subtitle Burn Overlay */}
            <div className="absolute bottom-[12%] left-0 w-full text-center z-10 px-4">
              <p className="text-white font-bold text-base md:text-lg drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] bg-black/40 py-1 px-3 rounded-lg backdrop-blur-xs inline-block">
                "{selectedScene.subtitle || selectedScene.narration}"
              </p>
            </div>

            {/* Header info badge */}
            <div className="absolute top-3 left-3 z-10 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded font-mono text-[10px] text-white border border-[#262626]">
              Scene {selectedScene.scene_number} / {scenes.length}
            </div>
          </div>
        ) : null}

        {/* Player Controls Bar */}
        <div className="mt-6 w-full max-w-[500px] bg-[#141414] rounded-full px-5 py-2.5 border border-[#262626] flex items-center gap-3">
          <button className="text-[#cbc3d7] hover:text-white">
            <span className="material-symbols-outlined text-lg">skip_previous</span>
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
          </button>
          <button className="text-[#cbc3d7] hover:text-white">
            <span className="material-symbols-outlined text-lg">skip_next</span>
          </button>

          <div className="flex-1 flex items-center gap-2 mx-2">
            <span className="font-mono text-[10px] text-[#cbc3d7]">00:02</span>
            <div className="flex-1 h-1.5 bg-[#262626] rounded-full relative cursor-pointer">
              <div className="absolute left-0 top-0 h-full bg-[#8B5CF6] rounded-full w-[40%]"></div>
            </div>
            <span className="font-mono text-[10px] text-[#cbc3d7]">
              00:0{selectedScene?.duration || 5}
            </span>
          </div>

          <button className="text-[#cbc3d7] hover:text-white">
            <span className="material-symbols-outlined text-lg">volume_up</span>
          </button>
        </div>
      </div>

      {/* 3. Right Inspector Sidebar (320px Pane) */}
      {selectedScene ? (
        <div className="w-full md:w-[320px] bg-[#141414] border-l border-[#262626] flex flex-col h-auto md:h-full shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-[#262626]">
            <button
              onClick={() => setActiveInspectorTab('media')}
              className={`flex-1 py-3 font-mono text-xs font-semibold ${
                activeInspectorTab === 'media'
                  ? 'text-[#d0bcff] border-b-2 border-[#8B5CF6]'
                  : 'text-[#cbc3d7] hover:text-white'
              }`}
            >
              Media
            </button>
            <button
              onClick={() => setActiveInspectorTab('voice')}
              className={`flex-1 py-3 font-mono text-xs font-semibold ${
                activeInspectorTab === 'voice'
                  ? 'text-[#d0bcff] border-b-2 border-[#8B5CF6]'
                  : 'text-[#cbc3d7] hover:text-white'
              }`}
            >
              Voice
            </button>
            <button
              onClick={() => setActiveInspectorTab('subtitles')}
              className={`flex-1 py-3 font-mono text-xs font-semibold ${
                activeInspectorTab === 'subtitles'
                  ? 'text-[#d0bcff] border-b-2 border-[#8B5CF6]'
                  : 'text-[#cbc3d7] hover:text-white'
              }`}
            >
              Subtitles
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-6 flex-1">
            {/* Header */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-sm text-white">Scene {selectedScene.scene_number} Properties</h3>
                <span className="bg-[#8B5CF6]/20 text-[#d0bcff] px-2 py-0.5 rounded font-mono text-[10px] border border-[#8B5CF6]/30">
                  {selectedScene.image_status}
                </span>
              </div>
              <p className="font-mono text-[11px] text-[#cbc3d7]">
                {selectedScene.duration}s • {project.visual_style?.name || 'Cinematic Style'}
              </p>
            </div>

            {/* Prompt Textarea */}
            {activeInspectorTab === 'media' && <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="font-mono text-xs text-[#cbc3d7] uppercase">AI Image Prompt</label>
                <button className="text-[#d0bcff] hover:text-white font-mono text-[10px] flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">auto_awesome</span> Optimize
                </button>
              </div>
              <textarea
                value={selectedScene.image_prompt}
                onChange={(e) => onUpdateScene(selectedScene.id, { image_prompt: e.target.value })}
                rows={4}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded p-3 text-xs text-white focus:border-[#3B82F6] outline-none resize-none font-sans"
              />
            </div>}

            {activeInspectorTab === 'voice' && (
              <div className="space-y-3 bg-[#0A0A0A] border border-[#262626] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#cbc3d7] uppercase">Scene narration</span>
                  <span className={`font-mono text-[10px] ${selectedScene.audio_status === 'READY' ? 'text-[#4edea3]' : 'text-[#958ea0]'}`}>
                    {selectedScene.audio_status}
                  </span>
                </div>
                <p className="text-xs text-white leading-relaxed">{selectedScene.narration}</p>
                {selectedScene.audio_url ? (
                  <audio className="w-full" controls src={selectedScene.audio_url} />
                ) : (
                  <p className="text-[11px] text-[#958ea0]">VieNeu narration will be generated before rendering.</p>
                )}
              </div>
            )}

            {activeInspectorTab === 'subtitles' && (
              <div className="space-y-2">
                <label className="font-mono text-xs text-[#cbc3d7] uppercase">Subtitle text</label>
                <textarea
                  value={selectedScene.subtitle}
                  onChange={(event) => onUpdateScene(selectedScene.id, { subtitle: event.target.value })}
                  rows={4}
                  className="w-full bg-[#0A0A0A] border border-[#262626] rounded p-3 text-xs text-white focus:border-[#3B82F6] outline-none resize-none"
                />
              </div>
            )}

            {/* Controls */}
            {activeInspectorTab === 'media' && <div className="space-y-4">
              <div>
                <label className="font-mono text-xs text-[#cbc3d7] block mb-2">Motion Intensity</label>
                <div className="flex gap-2">
                  {['Low', 'Medium', 'High'].map((m) => (
                    <button
                      key={m}
                      onClick={() => onUpdateScene(selectedScene.id, { motion_intensity: m as any })}
                      className={`flex-1 py-1.5 rounded font-mono text-xs border ${
                        selectedScene.motion_intensity === m
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#d0bcff]'
                          : 'bg-[#1c1b1b] border-[#262626] text-[#cbc3d7] hover:bg-[#201f1f]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-mono text-xs text-[#cbc3d7] block mb-2">Camera Movement</label>
                <select
                  value={selectedScene.camera_movement}
                  onChange={(e) => onUpdateScene(selectedScene.id, { camera_movement: e.target.value as any })}
                  className="w-full bg-[#0A0A0A] border border-[#262626] rounded p-2 text-xs text-white focus:border-[#3B82F6] outline-none"
                >
                  <option value="Pan Up (Ascend)">Pan Up (Ascend)</option>
                  <option value="Zoom In">Zoom In</option>
                  <option value="Pan Left">Pan Left</option>
                  <option value="Static">Static</option>
                  <option value="Dynamic Track">Dynamic Track</option>
                </select>
              </div>
            </div>}

            {/* Actions */}
            <div className="pt-4 border-t border-[#262626] space-y-3">
              <button
                onClick={() => onRegenerateSceneImage(selectedScene.id)}
                className="w-full bg-transparent border border-[#525252] text-white py-2 rounded-md font-mono text-xs hover:bg-[#201f1f] transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">replay</span>
                Regenerate Image
              </button>

              <button
                onClick={() => onGenerateSceneVideo(selectedScene.id)}
                className="w-full bg-[#2a2a2a] border border-[#494454] text-white py-2 rounded-md font-mono text-xs hover:bg-[#353534] transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">movie</span>
                Generate Video Clip
              </button>

              <div className="pt-2">
                <label className="w-full cursor-pointer bg-[#0e0e0e] border border-[#262626] text-[#cbc3d7] hover:text-white py-2 rounded-md font-mono text-[11px] flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-xs">upload</span>
                  Tải clip MP4 lên / Upload MP4 (tối đa 100 MB)
                  <input
                    type="file"
                    accept="video/mp4,.mp4"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onUploadSceneVideo(selectedScene.id, file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => onNavigate('render', project.id)}
                  className="w-full bg-[#8B5CF6] hover:bg-[#7c4dff] text-white py-2.5 rounded-md font-mono text-xs font-semibold shadow-lg shadow-[#8B5CF6]/20 flex items-center justify-center gap-2"
                >
                  Proceed to Voice & Render
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
