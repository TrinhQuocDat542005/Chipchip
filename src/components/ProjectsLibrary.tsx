import React, { useState } from 'react';
import { VideoProject } from '../types';

interface ProjectsLibraryProps {
  projects: VideoProject[];
  onSelectProject: (projectId: string) => void;
  onNavigate: (tab: string, projectId?: string) => void;
}

export const ProjectsLibrary: React.FC<ProjectsLibraryProps> = ({
  projects,
  onSelectProject,
  onNavigate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filtered = projects.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.topic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-fadeIn py-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#262626] pb-6">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Projects Library</h2>
          <p className="text-sm text-[#cbc3d7] mt-1">Manage and review your AI generated video projects.</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#958ea0] text-sm">
              search
            </span>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0A0A0A] border border-[#262626] rounded-md py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-[#3B82F6]"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#141414] border border-[#262626] text-white text-xs font-mono rounded-md px-3 py-2 outline-none"
          >
            <option value="ALL">Status: All</option>
            <option value="DRAFT">Drafts</option>
            <option value="SCRIPT_READY">Script Ready</option>
            <option value="RENDERING">Rendering</option>
            <option value="REVIEW">Needs Review</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map((proj) => {
          const previewImg =
            proj.scenes?.[0]?.image_url ||
            proj.visual_style?.preview_url ||
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80';

          return (
            <div
              key={proj.id}
              onClick={() => {
                onSelectProject(proj.id);
                if (proj.status === 'REVIEW') {
                  onNavigate('review', proj.id);
                } else {
                  onNavigate('scene-studio', proj.id);
                }
              }}
              className="group relative rounded-xl bg-[#141414] border border-[#262626] overflow-hidden hover:bg-[#1c1b1b] transition-all cursor-pointer flex flex-col h-[460px]"
            >
              <div className="relative flex-1 overflow-hidden bg-[#0e0e0e]">
                <img
                  src={previewImg}
                  alt={proj.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/40 to-transparent"></div>

                {/* Status Badge */}
                <div className="absolute top-4 left-4">
                  {proj.status === 'COMPLETED' ? (
                    <span className="px-2 py-1 rounded bg-[#4edea3]/20 border border-[#4edea3]/30 text-[#4edea3] font-mono text-[10px] backdrop-blur-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]"></span>
                      Completed
                    </span>
                  ) : proj.status === 'REVIEW' ? (
                    <span className="px-2 py-1 rounded bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-mono text-[10px] backdrop-blur-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
                      Review
                    </span>
                  ) : proj.status === 'RENDERING' ? (
                    <span className="px-2 py-1 rounded bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#d0bcff] font-mono text-[10px] backdrop-blur-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse"></span>
                      Rendering
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded bg-[#201f1f] border border-[#494454] text-[#cbc3d7] font-mono text-[10px] backdrop-blur-sm">
                      {proj.status.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-2">
                <h3 className="font-semibold text-base text-white truncate">{proj.title}</h3>
                <div className="flex items-center gap-4 text-[#cbc3d7] font-mono text-xs">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">schedule</span> 00:45
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">movie</span> {proj.scenes?.length || 4} scenes
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
