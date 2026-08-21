import React, { createContext, useContext, useMemo, useState } from 'react';

type Locale = 'vi' | 'en';

const messages = {
  vi: {
    dashboard: 'Tổng quan', createVideo: 'Tạo video', projects: 'Dự án', sceneStudio: 'Xưởng cảnh',
    review: 'Duyệt video', automations: 'Tự động hóa', providers: 'Nhà cung cấp AI', settings: 'Cài đặt',
    newProject: 'Dự án mới', drafts: 'Bản nháp', export: 'Xuất video', search: 'Tìm trong studio...',
    welcome: 'Chào mừng trở lại.', createToday: 'Hãy tạo một video mới hôm nay.', createNew: 'Tạo video mới',
    draftProjects: 'Dự án nháp', generating: 'Đang tạo', needsReview: 'Cần duyệt', completed: 'Hoàn thành',
    recentProjects: 'Dự án gần đây', viewAll: 'Xem tất cả',
    idea: 'Ý tưởng', script: 'Kịch bản', style: 'Phong cách', scenes: 'Cảnh', voice: 'Giọng đọc', render: 'Kết xuất',
    createTitle: 'Tạo video mới', createDescription: 'Biến một ý tưởng thành kịch bản và các cảnh video AI hoàn chỉnh.',
    topic: 'Chủ đề hoặc mô tả video', topicPlaceholder: 'Mô tả nội dung video ông muốn tạo...',
    platform: 'Nền tảng', duration: 'Thời lượng', language: 'Ngôn ngữ nội dung', tone: 'Sắc thái', visualStyle: 'Phong cách hình ảnh',
    generateScript: 'Tạo kịch bản', crafting: 'Đang viết kịch bản...', english: 'English', vietnamese: 'Tiếng Việt',
  },
  en: {
    dashboard: 'Dashboard', createVideo: 'Create Video', projects: 'Projects', sceneStudio: 'Scene Studio',
    review: 'Review', automations: 'Automations', providers: 'AI Providers', settings: 'Settings',
    newProject: 'New Project', drafts: 'Drafts', export: 'Export', search: 'Search studio...',
    welcome: 'Welcome back, Designer.', createToday: 'Create something today.', createNew: 'Create New Video',
    draftProjects: 'Draft Projects', generating: 'Generating', needsReview: 'Needs Review', completed: 'Completed',
    recentProjects: 'Recent Projects', viewAll: 'View All',
    idea: 'Idea', script: 'Script', style: 'Style', scenes: 'Scenes', voice: 'Voice', render: 'Render',
    createTitle: 'Create a New Video', createDescription: 'Turn an idea into a complete short-form AI video script & scenes.',
    topic: 'Video Topic or Prompt', topicPlaceholder: 'Describe what your video is about...',
    platform: 'Platform', duration: 'Duration', language: 'Content Language', tone: 'Tone', visualStyle: 'Visual Style',
    generateScript: 'Generate Script', crafting: 'Crafting Script...', english: 'English', vietnamese: 'Tiếng Việt',
  },
} as const;

type MessageKey = keyof typeof messages.vi;
const I18nContext = createContext({ locale: 'vi' as Locale, setLocale: (_locale: Locale) => {}, t: (_key: MessageKey) => '' });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => localStorage.getItem('ui-locale') === 'en' ? 'en' : 'vi');
  const value = useMemo(() => ({
    locale,
    setLocale: (next: Locale) => { localStorage.setItem('ui-locale', next); setLocaleState(next); },
    t: (key: MessageKey) => messages[locale][key],
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
