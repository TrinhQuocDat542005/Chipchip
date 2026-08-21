import React, { useState } from 'react';
import { VideoProject } from '../types';

interface CreateScriptProps {
  project: VideoProject;
  onUpdateScript: (updated: Partial<VideoProject>) => void;
  onApproveScript: () => void;
  onRegenerateScript: () => void;
  loading: boolean;
}

export const CreateScript: React.FC<CreateScriptProps> = ({
  project,
  onUpdateScript,
  onApproveScript,
  onRegenerateScript,
  loading,
}) => {
  const [hook, setHook] = useState(
    project.hook || 'Imagine a city, entirely submerged, where glowing coral replaces streetlights...'
  );
  const [narration, setNarration] = useState(
    project.narration_body ||
      "This is Atlantis, not a myth, but a simulated recreation of what could have been. We're diving deep into the architectural marvels, the advanced aqueducts, and the central spire."
  );
  const [cta, setCta] = useState(
    project.call_to_action || 'If you want to see more ancient mysteries brought to life, hit subscribe!'
  );

  const handleBlur = () => {
    onUpdateScript({ hook, narration_body: narration, call_to_action: cta });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn py-4">
      {/* Stepper */}
      <div className="flex items-center justify-center w-full max-w-3xl mx-auto mb-6">
        <div className="flex items-center w-full">
          {/* Idea (Completed) */}
          <div className="flex flex-col items-center relative">
            <div className="w-8 h-8 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center font-bold text-xs">
              <span className="material-symbols-outlined text-sm">check</span>
            </div>
            <span className="absolute top-9 font-mono text-xs text-[#d0bcff]">Idea</span>
          </div>

          <div className="flex-1 h-px bg-[#8B5CF6] mx-4"></div>

          {/* Script (Active) */}
          <div className="flex flex-col items-center relative">
            <div className="w-8 h-8 rounded-full bg-[#2a2a2a] border-2 border-[#8B5CF6] text-[#d0bcff] flex items-center justify-center font-mono text-xs font-bold">
              2
            </div>
            <span className="absolute top-9 font-mono text-xs text-[#d0bcff] font-bold">Script</span>
          </div>

          <div className="flex-1 h-px bg-[#262626] mx-4"></div>

          {/* Style */}
          <div className="flex flex-col items-center relative opacity-50">
            <div className="w-8 h-8 rounded-full bg-[#201f1f] border border-[#494454] text-[#958ea0] flex items-center justify-center font-mono text-xs">
              3
            </div>
            <span className="absolute top-9 font-mono text-xs text-[#958ea0]">Style</span>
          </div>

          <div className="flex-1 h-px bg-[#262626] mx-4"></div>

          {/* Scenes */}
          <div className="flex flex-col items-center relative opacity-50">
            <div className="w-8 h-8 rounded-full bg-[#201f1f] border border-[#494454] text-[#958ea0] flex items-center justify-center font-mono text-xs">
              4
            </div>
            <span className="absolute top-9 font-mono text-xs text-[#958ea0]">Scenes</span>
          </div>
        </div>
      </div>

      {/* Main Workspace: Left Script Editor + Right Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mt-6">
        {/* Left: Script Editor (8 cols) */}
        <div className="xl:col-span-8 bg-[#141414] border border-[#262626] rounded-xl p-6 relative overflow-hidden space-y-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d0bcff] text-2xl">edit_document</span>
            <h2 className="text-xl font-semibold text-white">Script Editor</h2>
          </div>

          <div className="space-y-4">
            {/* Hook */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">
                  Hook (0:00 - 0:05)
                </label>
                <span className="text-[10px] uppercase font-mono tracking-wider bg-[#8B5CF6]/10 text-[#d0bcff] px-2 py-0.5 rounded border border-[#8B5CF6]/30">
                  HIGH IMPACT
                </span>
              </div>
              <textarea
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                onBlur={handleBlur}
                rows={2}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#3B82F6] transition-all resize-none font-sans"
              />
            </div>

            {/* Narration Body */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">Narration Body</label>
              <textarea
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                onBlur={handleBlur}
                rows={6}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#3B82F6] transition-all resize-y font-sans"
              />
            </div>

            {/* CTA */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">Call to Action</label>
              <textarea
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                onBlur={handleBlur}
                rows={2}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#3B82F6] transition-all resize-none font-sans"
              />
            </div>
          </div>
        </div>

        {/* Right: Video Summary & AI Suggestion Mode (4 cols) */}
        <div className="xl:col-span-4 space-y-4">
          {/* Summary Card */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 space-y-4">
            <h3 className="font-mono text-xs text-[#cbc3d7] uppercase tracking-wider">Video Summary</h3>
            <div className="space-y-3 divide-y divide-[#262626]">
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-[#cbc3d7]">Title</span>
                <span className="text-xs font-semibold text-white truncate max-w-[180px]">{project.title}</span>
              </div>
              <div className="flex justify-between items-center pt-3">
                <span className="text-xs text-[#cbc3d7]">Est. Duration</span>
                <span className="text-xs font-mono font-medium text-[#d0bcff]">00:45</span>
              </div>
              <div className="flex justify-between items-center pt-3">
                <span className="text-xs text-[#cbc3d7]">Scene Count</span>
                <span className="text-xs font-semibold text-white">{project.scenes?.length || 4} Scenes</span>
              </div>
              <div className="flex justify-between items-center pt-3">
                <span className="text-xs text-[#cbc3d7]">AI Model</span>
                <span className="text-[10px] font-mono bg-[#00a572]/20 text-[#4edea3] px-2 py-0.5 rounded border border-[#00a572]/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]"></span>
                  Gemini 2.5 Flash
                </span>
              </div>
            </div>
          </div>

          {/* AI Suggestion Card */}
          <div className="bg-[#1c1b1b] border border-[#262626] rounded-xl p-6 text-center space-y-2 cursor-pointer hover:bg-[#201f1f] transition-colors">
            <span className="material-symbols-outlined text-3xl text-[#d0bcff]">auto_awesome</span>
            <p className="text-xs font-semibold text-white">AI Suggestion Mode</p>
            <p className="text-[11px] text-[#cbc3d7]">Click to auto-tune hook variations for higher engagement</p>
          </div>
        </div>
      </div>

      {/* Scene Breakdown List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Scene Breakdown</h3>
        <div className="space-y-3">
          {project.scenes && project.scenes.length > 0 ? (
            project.scenes.map((sc, idx) => (
              <div
                key={sc.id}
                className={`bg-[#141414] rounded-lg p-4 flex gap-4 items-start border-l-4 ${
                  idx === 0 ? 'border-[#8B5CF6]' : 'border-transparent'
                } border border-[#262626] hover:bg-[#1c1b1b] transition-colors`}
              >
                <div className="flex flex-col items-center min-w-[50px] pt-1">
                  <span className="font-mono text-xs text-[#cbc3d7]">Sc {sc.scene_number.toString().padStart(2, '0')}</span>
                  <span className="font-mono text-[10px] text-[#d0bcff] mt-1">0:0{idx * 5}</span>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="font-mono text-[10px] text-[#cbc3d7] uppercase tracking-wider block mb-1">
                      Narration
                    </span>
                    <p className="text-xs text-white line-clamp-2">"{sc.narration}"</p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-[#cbc3d7] uppercase tracking-wider block mb-1">
                      Visual
                    </span>
                    <p className="text-xs text-[#cbc3d7] italic line-clamp-2">{sc.visual_description}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-[#958ea0]">No scenes generated yet.</p>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex justify-between items-center pt-6 border-t border-[#262626]">
        <button
          onClick={onRegenerateScript}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg border border-[#525252] text-white font-mono text-xs hover:bg-[#201f1f] transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Regenerate Script
        </button>

        <button
          onClick={onApproveScript}
          className="px-8 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7c4dff] text-white font-mono text-xs font-semibold transition-all flex items-center gap-2 shadow-lg shadow-[#8B5CF6]/30"
        >
          Approve Script
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};
