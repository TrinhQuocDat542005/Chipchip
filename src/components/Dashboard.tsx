import React from 'react';
import { GenerationJob, ProviderConfig, VideoProject } from '../types';
import { useI18n } from '../i18n';

interface DashboardProps {
  projects: VideoProject[];
  onNavigate: (tab: string, projectId?: string) => void;
  onSelectProject: (projectId: string) => void;
  jobs: GenerationJob[];
  onRetryJob: (jobId: string) => void;
  providers: ProviderConfig[];
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, jobs, providers, onNavigate, onSelectProject, onRetryJob }) => {
  const { t } = useI18n();
  const draftsCount = projects.filter((p) => p.status === 'DRAFT' || p.status === 'SCRIPT_READY').length;
  const generatingCount = projects.filter((p) =>
    ['SCRIPT_GENERATING', 'IMAGES_GENERATING', 'VIDEOS_GENERATING', 'VOICE_GENERATING', 'RENDERING'].includes(p.status)
  ).length;
  const reviewCount = projects.filter((p) => p.status === 'REVIEW').length;
  const completedCount = projects.filter((p) => p.status === 'COMPLETED').length;
  const failedJobs = jobs.filter(job => job.status === 'FAILED' && projects.some(project => project.id === job.project_id && project.status === 'FAILED'));
  const activeProviders = providers.filter(provider => provider.status === 'Active');
  const unavailableProviders = providers.filter(provider => provider.status === 'Unavailable' || provider.status === 'Not Configured');

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#262626] pb-6">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{t('welcome')}</h2>
          <p className="text-base text-[#cbc3d7] mt-1">{t('createToday')}</p>
        </div>
        <button
          onClick={() => onNavigate('create')}
          className="bg-[#8B5CF6] text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-[#7c4dff] transition-all shadow-lg shadow-[#8B5CF6]/20 font-mono text-sm font-semibold"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('createNew')}
        </button>
      </div>

      <section className="bg-[#141414] border border-[#262626] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Generation Jobs</h3>
          <span className="text-[10px] font-mono text-[#958ea0]">SSE LIVE</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {jobs.slice(0, 6).map((job) => (
            <div key={job.id} className="flex items-center gap-3 bg-[#0A0A0A] border border-[#262626] rounded-lg p-3">
              <span className={`w-2.5 h-2.5 rounded-full ${job.status === 'COMPLETED' ? 'bg-[#4edea3]' : job.status === 'FAILED' ? 'bg-red-400' : job.status === 'RUNNING' ? 'bg-[#8B5CF6] animate-pulse' : 'bg-amber-300'}`} />
              <div className="min-w-0 flex-1"><p className="text-xs text-white truncate">{job.type}</p><p className="text-[10px] font-mono text-[#958ea0]">{job.status} • {job.progress}% • thử {job.attempt_count}/{job.max_attempts}</p></div>
              {job.status === 'FAILED' && <button onClick={() => onRetryJob(job.id)} className="text-[10px] text-[#d0bcff] border border-[#8B5CF6]/40 rounded px-2 py-1">Thử lại</button>}
            </div>
          ))}
          {!jobs.length && <p className="text-xs text-[#958ea0]">Chưa có job nào.</p>}
        </div>
      </section>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Drafts */}
        <div
          onClick={() => onNavigate('projects')}
          className="bg-[#141414] p-6 rounded-xl border border-[#262626] relative overflow-hidden group hover:border-[#958ea0] transition-all cursor-pointer"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-2.5 bg-[#0e0e0e] rounded-lg border border-[#262626] text-[#cbc3d7]">
              <span className="material-symbols-outlined text-xl">edit_document</span>
            </div>
            <span className="text-3xl font-bold text-white">{draftsCount}</span>
          </div>
          <h3 className="font-mono text-xs text-[#cbc3d7] uppercase tracking-wider">{t('draftProjects')}</h3>
        </div>

        {/* Generating */}
        <div
          onClick={() => onNavigate('projects')}
          className="bg-[#141414] p-6 rounded-xl border border-[#8B5CF6]/40 relative overflow-hidden group hover:border-[#8B5CF6] transition-all cursor-pointer"
        >
          <div className="absolute inset-0 bg-[#8B5CF6]/5 pointer-events-none"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-2.5 bg-[#8B5CF6]/20 rounded-lg border border-[#8B5CF6]/30 text-[#d0bcff]">
              <span className="material-symbols-outlined text-xl animate-spin">autorenew</span>
            </div>
            <span className="text-3xl font-bold text-[#d0bcff]">{generatingCount}</span>
          </div>
          <h3 className="font-mono text-xs text-[#d0bcff] uppercase tracking-wider relative z-10">{t('generating')}</h3>
          <div className="w-full bg-[#0e0e0e] h-1.5 mt-3 rounded-full overflow-hidden">
            <div className="bg-[#8B5CF6] h-full w-3/4 animate-pulse"></div>
          </div>
        </div>

        {/* Needs Review */}
        <div
          onClick={() => onNavigate('review')}
          className="bg-[#141414] p-6 rounded-xl border border-[#4edea3]/30 relative overflow-hidden group hover:border-[#4edea3] transition-all cursor-pointer"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-2.5 bg-[#00a572]/10 rounded-lg border border-[#00a572]/30 text-[#4edea3]">
              <span className="material-symbols-outlined text-xl">fact_check</span>
            </div>
            <span className="text-3xl font-bold text-[#4edea3]">{reviewCount}</span>
          </div>
          <h3 className="font-mono text-xs text-[#4edea3] uppercase tracking-wider">{t('needsReview')}</h3>
        </div>

        {/* Completed */}
        <div
          onClick={() => onNavigate('projects')}
          className="bg-[#141414] p-6 rounded-xl border border-[#262626] relative overflow-hidden group hover:border-[#958ea0] transition-all cursor-pointer"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-2.5 bg-[#0e0e0e] rounded-lg border border-[#262626] text-[#cbc3d7]">
              <span className="material-symbols-outlined text-xl">task_alt</span>
            </div>
            <span className="text-3xl font-bold text-white">{completedCount}</span>
          </div>
          <h3 className="font-mono text-xs text-[#cbc3d7] uppercase tracking-wider">{t('completed')}</h3>
        </div>
      </div>

      {/* Main Grid & Attention Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Recent Projects (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white tracking-tight">{t('recentProjects')}</h3>
            <button
              onClick={() => onNavigate('projects')}
              className="text-[#d0bcff] hover:text-white font-mono text-xs flex items-center gap-1 transition-colors"
            >
              {t('viewAll')} <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.slice(0, 6).map((proj) => {
              const previewImg =
                proj.scenes?.[0]?.image_url ||
                proj.visual_style?.preview_url ||
                'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80';

              const isGenerating = [
                'SCRIPT_GENERATING',
                'IMAGES_GENERATING',
                'VIDEOS_GENERATING',
                'VOICE_GENERATING',
                'RENDERING',
              ].includes(proj.status);

              return (
                <div
                  key={proj.id}
                  className="bg-[#141414] rounded-xl border border-[#262626] overflow-hidden group flex flex-col h-[400px] transition-all hover:border-[#494454]"
                >
                  {/* 9:16 Aspect ratio frame */}
                  <div className="relative w-full flex-1 bg-[#0e0e0e] overflow-hidden">
                    <img
                      src={previewImg}
                      alt={proj.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/50 to-transparent"></div>

                    {/* Status badge */}
                    <div className="absolute top-3 left-3">
                      {isGenerating ? (
                        <span className="bg-[#8B5CF6]/30 backdrop-blur-md border border-[#8B5CF6]/50 text-[#d0bcff] px-2 py-1 rounded font-mono text-[10px] flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                          {t('generating')}
                        </span>
                      ) : proj.status === 'REVIEW' ? (
                        <span className="bg-[#00a572]/20 backdrop-blur-md border border-[#00a572]/40 text-[#4edea3] px-2 py-1 rounded font-mono text-[10px] flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">priority_high</span>
                          {t('needsReview')}
                        </span>
                      ) : (
                        <span className="bg-black/60 backdrop-blur-md border border-[#262626] text-[#cbc3d7] px-2 py-1 rounded font-mono text-[10px]">
                          {proj.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>

                    {/* Platform badge */}
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm border border-[#262626] text-white px-2 py-0.5 rounded font-mono text-[10px]">
                      {proj.platform.split(' ')[0]}
                    </div>

                    {/* Title */}
                    <div className="absolute bottom-3 left-3 right-3">
                      <h4 className="text-base font-semibold text-white truncate shadow-sm">{proj.title}</h4>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-4 bg-[#141414] border-t border-[#262626] space-y-3">
                    {isGenerating ? (
                      <div>
                        <div className="flex justify-between font-mono text-[10px] text-[#cbc3d7] mb-1">
                          <span className="truncate max-w-[150px]">{proj.status_message || 'Processing...'}</span>
                          <span className="text-[#d0bcff]">{proj.progress}%</span>
                        </div>
                        <div className="w-full bg-[#0e0e0e] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#8B5CF6] h-full rounded-full transition-all duration-300"
                            style={{ width: `${proj.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[#cbc3d7] line-clamp-1">{proj.topic}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          onSelectProject(proj.id);
                          onNavigate('scene-studio', proj.id);
                        }}
                        className="flex-1 bg-transparent border border-[#525252] text-white py-1.5 rounded-md hover:bg-[#201f1f] transition-colors font-mono text-xs flex justify-center items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">visibility</span> Preview
                      </button>
                      <button
                        onClick={() => {
                          onSelectProject(proj.id);
                          if (proj.status === 'REVIEW') {
                            onNavigate('review', proj.id);
                          } else {
                            onNavigate('scene-studio', proj.id);
                          }
                        }}
                        className="flex-1 bg-[#2a2a2a] text-white py-1.5 rounded-md hover:bg-[#353534] transition-colors font-mono text-xs flex justify-center items-center gap-1 font-medium"
                      >
                        {proj.status === 'REVIEW' ? 'Review' : 'Continue'}
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar: Needs Attention Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#141414] border border-[#ffb4ab]/30 rounded-xl p-5 sticky top-20">
            <div className="flex items-center gap-2 mb-4 text-[#ffb4ab]">
              <span className="material-symbols-outlined">warning</span>
              <h3 className="font-semibold text-base">Needs Attention</h3>
            </div>

            <div className="space-y-3">
              {/* Failed Job Alert */}
              <div className="bg-[#1c1b1b] border border-[#ffb4ab]/20 p-3.5 rounded-lg space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-[#ffb4ab] bg-[#93000a]/20 px-2 py-0.5 rounded border border-[#93000a]/30">
                    {failedJobs.length ? `${failedJobs.length} job lỗi` : 'Hệ thống'}
                  </span>
                  <span className="text-[#958ea0] text-[10px]">{failedJobs.length ? 'Cần kiểm tra' : 'Ổn định'}</span>
                </div>
                <p className="text-xs text-white mt-1">
                  {failedJobs.length ? `${failedJobs[0].type}: ${failedJobs[0].error_message || 'Không rõ lỗi'}` : 'Pipeline video đang hoạt động và sẵn sàng xử lý.'}
                </p>
                <button
                  onClick={() => onNavigate('providers')}
                  className="mt-2 text-[11px] font-mono text-[#d0bcff] hover:underline flex items-center gap-1"
                >
                  View Provider Status <span className="material-symbols-outlined text-xs">open_in_new</span>
                </button>
              </div>

              {/* Provider Config Alert */}
              <div className="bg-[#1c1b1b] border border-[#262626] p-3.5 rounded-lg space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-[#cbc3d7] bg-[#2a2a2a] px-2 py-0.5 rounded">
                    Config Status
                  </span>
                </div>
                <p className="text-xs text-white mt-1">
                  {activeProviders.length} provider đang hoạt động{unavailableProviders.length ? `; ${unavailableProviders.length} provider chưa cấu hình hoặc không khả dụng.` : '.'}
                </p>
                <button
                  onClick={() => onNavigate('providers')}
                  className="mt-2 w-full bg-[#0e0e0e] border border-[#262626] text-white py-1.5 rounded-md hover:bg-[#201f1f] transition-colors text-xs font-mono flex justify-center items-center gap-1"
                >
                  Provider Manager
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
