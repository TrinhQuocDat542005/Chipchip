import React, { useEffect, useState } from 'react';
import { ProviderConfig } from '../types';

interface AIProvidersProps {
  providers: ProviderConfig[];
  onRefresh: () => Promise<void>;
}

const choices: Record<string, Array<{ value: string; label: string }>> = {
  Image: [{ value: 'placeholder', label: 'Local Placeholder (free)' }, { value: 'gemini', label: 'Gemini Imagen' }],
  Video: [{ value: 'local-motion', label: 'Local FFmpeg Motion' }, { value: 'manual', label: 'Manual MP4 Upload' }],
  TTS: [{ value: 'vieneu', label: 'VieNeu Local' }, { value: 'mock', label: 'Mock Tone (test only)' }],
};

export const AIProviders: React.FC<AIProvidersProps> = ({ providers, onRefresh }) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { if (message) { const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); } }, [message]);

  const test = async (category: string) => {
    setBusy(category);
    const response = await fetch(`/api/providers/${category.toLowerCase()}/test`, { method: 'POST' });
    const result = await response.json();
    setMessage(`${category}: ${result.message}`);
    setBusy('');
  };

  const select = async (category: string, provider: string) => {
    setBusy(category);
    const response = await fetch(`/api/providers/${category.toLowerCase()}/select`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }),
    });
    const result = await response.json();
    setMessage(response.ok ? `Đã chọn ${provider} cho ${category}` : result.error);
    await onRefresh();
    setBusy('');
  };

  return (
    <div className="space-y-6 animate-fadeIn py-4">
      <header className="border-b border-[#262626] pb-5">
        <h2 className="text-2xl font-bold text-white">Nhà cung cấp AI</h2>
        <p className="text-sm text-[#cbc3d7] mt-1">Cấu hình thật được lưu trong SQLite; API key chỉ tồn tại phía server.</p>
      </header>
      {message && <div className="bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 text-[#d0bcff] p-3 rounded-lg text-xs">{message}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((provider) => {
          const options = choices[provider.category];
          const activeValue = provider.id === 'gemini-imagen' ? 'gemini' : provider.id;
          return (
            <section key={`${provider.category}-${provider.id}`} className="bg-[#141414] border border-[#262626] rounded-xl p-5 space-y-4">
              <div className="flex justify-between gap-3">
                <div><p className="font-mono text-[10px] text-[#958ea0] uppercase">{provider.category}</p><h3 className="text-base font-bold text-white">{provider.name}</h3></div>
                <span className={`h-fit px-2 py-1 rounded text-[10px] font-mono border ${provider.status === 'Active' || provider.status === 'Configured' ? 'text-[#4edea3] border-[#4edea3]/30 bg-[#4edea3]/10' : 'text-amber-300 border-amber-300/30'}`}>{provider.status}</span>
              </div>
              <p className="text-xs text-[#cbc3d7] min-h-8">{provider.usage_info || provider.model}</p>
              {options && (
                <select value={activeValue} disabled={busy === provider.category} onChange={(event) => void select(provider.category, event.target.value)} className="w-full bg-[#0A0A0A] border border-[#262626] rounded p-2 text-xs text-white">
                  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              )}
              <button disabled={busy === provider.category} onClick={() => void test(provider.category)} className="w-full border border-[#525252] rounded py-2 text-xs text-white hover:bg-[#201f1f] disabled:opacity-50">
                {busy === provider.category ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
              </button>
            </section>
          );
        })}
      </div>

      {/* HuggingFace Pyannote Token Section */}
      <section className="bg-[#141414] border border-indigo-500/30 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">HuggingFace Token (Pyannote Speaker Diarization)</h3>
            <p className="text-xs text-[#cbc3d7] mt-0.5">Dùng để kích hoạt tính năng tự động nhận diện và phân tách giọng từng nhân vật trong phim.</p>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">Configured</span>
        </div>
        <div className="flex gap-3">
          <input
            type="password"
            value=""
            placeholder="Configure via HF_TOKEN"
            readOnly
            className="flex-1 bg-[#0A0A0A] border border-[#262626] rounded p-2 text-xs text-white font-mono"
          />
          <button className="px-4 py-2 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded text-xs font-medium">
            Đã Lưu Vô DB
          </button>
        </div>
      </section>
    </div>
  );
};
