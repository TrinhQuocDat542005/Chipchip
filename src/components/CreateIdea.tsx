import React, { useState } from 'react';
import { DEFAULT_STYLE_PRESETS } from '../data/stylePresets';
import { PlatformType } from '../types';
import { useI18n } from '../i18n';

interface CreateIdeaProps {
  onGenerateScript: (data: {
    topic: string;
    platform: PlatformType;
    duration: '30 seconds' | '60 seconds' | '90 seconds';
    language: string;
    tone: string;
    visual_style_id: string;
  }) => void;
  loading: boolean;
}

export const CreateIdea: React.FC<CreateIdeaProps> = ({ onGenerateScript, loading }) => {
  const { t } = useI18n();
  const [topic, setTopic] = useState('Bí ẩn Tam giác Bermuda và những vụ mất tích chưa có lời giải.');
  const [platform, setPlatform] = useState<PlatformType>('TikTok / Shorts (9:16)');
  const [duration, setDuration] = useState<'30 seconds' | '60 seconds' | '90 seconds'>('60 seconds');
  const [language, setLanguage] = useState('Vietnamese');
  const [tone, setTone] = useState('Cinematic / Mysterious');
  const [selectedStyleId, setSelectedStyleId] = useState('dark-mystery');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    onGenerateScript({
      topic,
      platform,
      duration,
      language,
      tone,
      visual_style_id: selectedStyleId,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn py-4">
      {/* 7-Step Wizard Stepper */}
      <nav className="w-full overflow-x-auto pb-4">
        <ol className="flex items-center min-w-[650px] w-full">
          <li className="flex w-full items-center text-[#d0bcff] after:content-[''] after:w-full after:h-1 after:border-b after:border-[#8B5CF6] after:border-4 after:inline-block">
            <span className="flex items-center justify-center w-9 h-9 bg-[#8B5CF6] text-white rounded-full shrink-0 font-bold">
              <span className="material-symbols-outlined text-sm">lightbulb</span>
            </span>
            <span className="absolute mt-14 font-mono text-xs text-[#d0bcff]">{t('idea')}</span>
          </li>
          <li className="flex w-full items-center text-[#958ea0] after:content-[''] after:w-full after:h-1 after:border-b after:border-[#262626] after:border-4 after:inline-block">
            <span className="flex items-center justify-center w-9 h-9 bg-[#201f1f] rounded-full shrink-0 border border-[#494454]">
              <span className="material-symbols-outlined text-sm">description</span>
            </span>
            <span className="absolute mt-14 font-mono text-xs text-[#958ea0] -ml-2">{t('script')}</span>
          </li>
          <li className="flex w-full items-center text-[#958ea0] after:content-[''] after:w-full after:h-1 after:border-b after:border-[#262626] after:border-4 after:inline-block">
            <span className="flex items-center justify-center w-9 h-9 bg-[#201f1f] rounded-full shrink-0 border border-[#494454]">
              <span className="material-symbols-outlined text-sm">palette</span>
            </span>
            <span className="absolute mt-14 font-mono text-xs text-[#958ea0] -ml-2">{t('style')}</span>
          </li>
          <li className="flex w-full items-center text-[#958ea0] after:content-[''] after:w-full after:h-1 after:border-b after:border-[#262626] after:border-4 after:inline-block">
            <span className="flex items-center justify-center w-9 h-9 bg-[#201f1f] rounded-full shrink-0 border border-[#494454]">
              <span className="material-symbols-outlined text-sm">auto_awesome_mosaic</span>
            </span>
            <span className="absolute mt-14 font-mono text-xs text-[#958ea0] -ml-2">{t('scenes')}</span>
          </li>
          <li className="flex w-full items-center text-[#958ea0] after:content-[''] after:w-full after:h-1 after:border-b after:border-[#262626] after:border-4 after:inline-block">
            <span className="flex items-center justify-center w-9 h-9 bg-[#201f1f] rounded-full shrink-0 border border-[#494454]">
              <span className="material-symbols-outlined text-sm">record_voice_over</span>
            </span>
            <span className="absolute mt-14 font-mono text-xs text-[#958ea0] -ml-2">{t('voice')}</span>
          </li>
          <li className="flex w-full items-center text-[#958ea0] after:content-[''] after:w-full after:h-1 after:border-b after:border-[#262626] after:border-4 after:inline-block">
            <span className="flex items-center justify-center w-9 h-9 bg-[#201f1f] rounded-full shrink-0 border border-[#494454]">
              <span className="material-symbols-outlined text-sm">movie</span>
            </span>
            <span className="absolute mt-14 font-mono text-xs text-[#958ea0] -ml-2">{t('render')}</span>
          </li>
          <li className="flex items-center">
            <span className="flex items-center justify-center w-9 h-9 bg-[#201f1f] rounded-full shrink-0 border border-[#494454]">
              <span className="material-symbols-outlined text-sm">rate_review</span>
            </span>
            <span className="absolute mt-14 font-mono text-xs text-[#958ea0] -ml-2">{t('review')}</span>
          </li>
        </ol>
      </nav>

      {/* Main Creation Form Card */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 md:p-8 space-y-8 mt-8 shadow-2xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">{t('createTitle')}</h1>
          <p className="text-sm text-[#cbc3d7]">{t('createDescription')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Topic Input */}
          <div className="space-y-2">
            <label htmlFor="topic" className="font-mono text-xs uppercase tracking-wider text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#d0bcff] text-base">psychology</span>
              {t('topic')}
            </label>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t('topicPlaceholder')}
              rows={4}
              className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-4 text-sm text-white focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all resize-none font-sans"
              required
            />
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">{t('platform')}</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformType)}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-[#3B82F6] outline-none"
              >
                <option value="TikTok / Shorts (9:16)">TikTok / Shorts (9:16)</option>
                <option value="YouTube (16:9)">YouTube (16:9)</option>
                <option value="Instagram Square (1:1)">Instagram Square (1:1)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">{t('duration')}</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value as any)}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-[#3B82F6] outline-none"
              >
                <option value="30 seconds">30 seconds</option>
                <option value="60 seconds">60 seconds</option>
                <option value="90 seconds">90 seconds</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">{t('language')}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-[#3B82F6] outline-none"
              >
                <option value="English (US)">English (US)</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Vietnamese">Tiếng Việt</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">{t('tone')}</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-[#3B82F6] outline-none"
              >
                <option value="Cinematic / Mysterious">Cinematic / Mysterious</option>
                <option value="Educational / Professional">Educational / Professional</option>
                <option value="Energetic / Trendy">Energetic / Trendy</option>
                <option value="Dark Thriller">Dark Thriller</option>
              </select>
            </div>
          </div>

          {/* Visual Style Presets */}
          <div className="space-y-4">
            <label className="font-mono text-xs uppercase tracking-wider text-[#cbc3d7]">{t('visualStyle')}</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {DEFAULT_STYLE_PRESETS.slice(0, 4).map((preset) => {
                const isSelected = selectedStyleId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedStyleId(preset.id)}
                    className={`rounded-xl p-4 cursor-pointer flex flex-col items-center gap-3 transition-all relative overflow-hidden ${
                      isSelected
                        ? 'bg-[#2a2a2a] border-2 border-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/20'
                        : 'bg-[#1c1b1b] border border-[#262626] hover:bg-[#201f1f]'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 text-[#d0bcff]">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                      </div>
                    )}
                    <div className="w-16 h-16 rounded-full overflow-hidden border border-[#494454]">
                      <img src={preset.preview_url} alt={preset.name} className="w-full h-full object-cover" />
                    </div>
                    <span className={`font-mono text-xs font-semibold ${isSelected ? 'text-[#d0bcff]' : 'text-white'}`}>
                      {preset.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Submit Action */}
          <div className="pt-6 border-t border-[#262626] flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-[#8B5CF6] hover:bg-[#7c4dff] text-white px-8 py-3 rounded-lg font-mono text-sm font-semibold flex items-center gap-2 transition-transform hover:scale-105 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  {t('crafting')}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  {t('generateScript')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
