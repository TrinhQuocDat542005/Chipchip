import React, { useState } from 'react';
import { CharacterProfile, DubbingProject } from '../types';
import { Users, Plus, Trash2, User, Volume2, Sparkles, Check } from 'lucide-react';

interface CharacterManagerProps {
  project: DubbingProject;
  onUpdateProject: (updated: Partial<DubbingProject>) => void;
}

export const CharacterManager: React.FC<CharacterManagerProps> = ({ project, onUpdateProject }) => {
  const characters = project.characters || [];
  const uniqueSpeakers = Array.from(new Set(project.segments.map((s) => s.speaker).filter(Boolean))) as string[];

  const [name, setName] = useState('');
  const [speakerId, setSpeakerId] = useState(uniqueSpeakers[0] || 'SPEAKER_00');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'CHILD' | 'NEUTRAL'>('MALE');

  const handleAddCharacter = () => {
    if (!name.trim()) return;
    const newChar: CharacterProfile = {
      id: `char-${Date.now()}`,
      name: name.trim(),
      speaker_id: speakerId,
      gender,
      voice_speed: 1.0,
      voice_pitch: 1.0,
    };
    const updated = [...characters, newChar];
    onUpdateProject({ characters: updated });
    setName('');
  };

  const handleRemoveCharacter = (id: string) => {
    const updated = characters.filter((c) => c.id !== id);
    onUpdateProject({ characters: updated });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-base text-white">Quản Lý Nhân Vật & Chất Giọng (Multi-Speaker)</h3>
        </div>
        <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-full font-medium">
          Pyannote Active
        </span>
      </div>

      {/* Add New Character Form */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 mb-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Tên Nhân Vật</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Nam chính, Nữ phụ..."
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Ánh Xạ Speaker (Pyannote)</label>
          <select
            value={speakerId}
            onChange={(e) => setSpeakerId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            {uniqueSpeakers.length ? (
              uniqueSpeakers.map((spk) => (
                <option key={spk} value={spk}>
                  {spk}
                </option>
              ))
            ) : (
              <option value="SPEAKER_00">SPEAKER_00 (Chung)</option>
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Giới Tính / Giọng VieNeu</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as any)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="MALE">Nam (Male)</option>
            <option value="FEMALE">Nữ (Female)</option>
            <option value="CHILD">Trẻ Em (Child)</option>
            <option value="NEUTRAL">Trung Tính (Neutral)</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleAddCharacter}
            disabled={!name.trim()}
            className="w-full flex items-center justify-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium px-4 py-1.5 rounded-md text-xs transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Nhân Vật</span>
          </button>
        </div>
      </div>

      {/* Character List */}
      {characters.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs bg-slate-950/50 rounded-lg border border-dashed border-slate-800">
          Chưa cấu hình nhân vật riêng. Các câu thoại sẽ dùng giọng mặc định VieNeu.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {characters.map((char) => (
            <div
              key={char.id}
              className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800 hover:border-slate-700 transition-all"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">{char.name}</h4>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                    <span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-indigo-300">
                      {char.speaker_id || 'SPEAKER_00'}
                    </span>
                    <span>•</span>
                    <span>{char.gender}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleRemoveCharacter(char.id)}
                className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-md transition-colors"
                title="Xóa nhân vật"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
