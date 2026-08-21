import React, { useState } from 'react';
import { useI18n } from '../i18n';

interface AppShellProps {
  currentTab: string;
  onNavigate: (tab: string, projectId?: string) => void;
  children: React.ReactNode;
  activeProjectTitle?: string;
  activeProjectStatus?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onNavigate,
  children,
  activeProjectTitle,
  activeProjectStatus,
}) => {
  const { locale, setLocale, t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: t('dashboard'), icon: 'dashboard' },
    { id: 'create', label: t('createVideo'), icon: 'add_box' },
    { id: 'dubbing', label: 'Dịch & lồng tiếng', icon: 'translate' },
    { id: 'series-hub', label: 'Quản lý Series & Cốt truyện', icon: 'auto_stories' },
    { id: 'projects', label: t('projects'), icon: 'folder' },
    { id: 'scene-studio', label: t('sceneStudio'), icon: 'movie_edit' },
    { id: 'review', label: t('review'), icon: 'rate_review' },
    { id: 'automations', label: t('automations'), icon: 'smart_toy' },
    { id: 'providers', label: t('providers'), icon: 'memory' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#e5e2e1] font-sans antialiased flex flex-col md:flex-row selection:bg-[#a078ff] selection:text-[#340080]">
      {/* Top Mobile Bar */}
      <header className="md:hidden sticky top-0 z-50 bg-[#131313]/90 backdrop-blur-md border-b border-[#262626] h-16 flex justify-between items-center px-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('dashboard')}>
          <span className="material-symbols-outlined text-[#d0bcff] text-2xl">memory</span>
          <span className="font-bold text-lg text-white tracking-tight">AI Video Factory</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-[#cbc3d7] hover:text-white"
        >
          <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
        </button>
      </header>

      {/* Desktop Sidebar */}
      <aside className={`fixed top-0 left-0 h-screen w-[280px] bg-[#131313] border-r border-[#262626] flex flex-col p-4 z-40 transition-transform duration-200 md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-center gap-3 mb-8 px-2 mt-2">
          <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-[#494454]">
            <span className="material-symbols-outlined text-[#d0bcff] text-xl">movie_edit</span>
          </div>
          <div>
            <h1 className="font-bold text-base text-white leading-tight tracking-tight">AI Video Factory</h1>
            <p className="font-mono text-xs text-[#cbc3d7]">Pro Workspace</p>
          </div>
        </div>

        {/* New Project Button */}
        <button
          onClick={() => onNavigate('create')}
          className="w-full mb-6 bg-[#8B5CF6] hover:bg-[#7c4dff] text-white py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-mono text-sm font-medium transition-colors shadow-lg shadow-[#8B5CF6]/20"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          {t('newProject')}
        </button>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#2a2a2a] text-[#d0bcff] border-l-4 border-[#8B5CF6] opacity-100'
                    : 'text-[#cbc3d7] hover:text-white hover:bg-[#1c1b1b]'
                }`}
              >
                <span className={`material-symbols-outlined text-xl ${isActive ? 'text-[#d0bcff]' : 'text-[#cbc3d7]'}`}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom User Area & Settings */}
        <div className="pt-4 border-t border-[#262626] space-y-2">
          <button
            onClick={() => {
              onNavigate('settings');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              currentTab === 'settings' ? 'bg-[#2a2a2a] text-[#d0bcff]' : 'text-[#cbc3d7] hover:text-white hover:bg-[#1c1b1b]'
            }`}
          >
            <span className="material-symbols-outlined text-xl">settings</span>
            {t('settings')}
          </button>

          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#1c1b1b] border border-[#262626]">
            <div className="w-8 h-8 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-xs font-bold text-[#d0bcff]">
              PRO
            </div>
            <div className="truncate">
              <p className="text-xs font-medium text-white truncate">Pro Creator</p>
              <p className="text-[10px] text-[#cbc3d7]">Enterprise Tier</p>
            </div>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}

      {/* Main Container */}
      <div className="flex-1 md:ml-[280px] flex flex-col min-h-screen">
        {/* Workspace Top Header Bar */}
        <header className="sticky top-16 md:top-0 z-30 bg-[#131313]/90 backdrop-blur-md border-b border-[#262626] min-h-16 flex items-center justify-between gap-3 px-4 md:px-6 py-2 md:py-0">
          {/* Left Context Breadcrumb */}
          <div className="flex items-center gap-3">
            {activeProjectTitle ? (
              <div className="flex min-w-0 items-center gap-2 text-sm text-[#cbc3d7]">
                <button onClick={() => onNavigate('projects')} className="hover:text-white transition-colors">
                  {t('projects')}
                </button>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span className="text-white font-medium truncate max-w-[180px] md:max-w-[300px]">
                  {activeProjectTitle}
                </span>
                {activeProjectStatus && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-[#4edea3]/10 text-[#4edea3] border border-[#4edea3]/20">
                    {activeProjectStatus}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">AI Video Factory</span>
                <span className="text-xs font-mono text-[#cbc3d7] bg-[#2a2a2a] px-2 py-0.5 rounded">
                  v3.0 Studio
                </span>
              </div>
            )}
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3">
            <div className="relative hidden lg:block">
              <input
                type="text"
                placeholder={t('search')}
                className="bg-[#0A0A0A] border border-[#262626] rounded-md px-3 py-1.5 pl-8 text-xs text-white focus:outline-none focus:border-[#3B82F6] transition-all w-48 placeholder:text-[#958ea0]"
              />
              <span className="material-symbols-outlined text-sm text-[#958ea0] absolute left-2.5 top-1/2 -translate-y-1/2">
                search
              </span>
            </div>

            <button
              onClick={() => onNavigate('create')}
              className="hidden sm:block px-3 py-1.5 rounded-md border border-[#525252] text-xs font-mono text-white hover:bg-[#201f1f] transition-colors"
            >
              {t('drafts')}
            </button>
            <button
              onClick={() => onNavigate('create')}
              className="hidden sm:block px-4 py-1.5 rounded-md bg-[#8B5CF6] hover:bg-[#7c4dff] text-xs font-mono font-medium text-white transition-colors"
            >
              {t('export')}
            </button>
            <button
              onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
              className="px-2.5 py-1.5 rounded-md border border-[#525252] text-xs font-mono text-[#d0bcff] hover:bg-[#201f1f]"
              title="Đổi ngôn ngữ giao diện"
            >
              {locale === 'vi' ? 'EN' : 'VI'}
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 md:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
