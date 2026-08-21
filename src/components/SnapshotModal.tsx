import React, { useState, useEffect } from 'react';
import { ProjectSnapshot } from '../types';
import { History, RotateCcw, Plus, Trash2, X, ShieldCheck, Clock } from 'lucide-react';

interface SnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onRestore: (snapshotId: string) => void;
}

export const SnapshotModal: React.FC<SnapshotModalProps> = ({ isOpen, onClose, projectId, onRestore }) => {
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSnapshots = async () => {
    try {
      const res = await fetch(`/api/dubbing/${projectId}/snapshots`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data);
      }
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      fetchSnapshots();
    }
  }, [isOpen, projectId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dubbing/${projectId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: 'MANUAL' }),
      });
      if (res.ok) {
        setName('');
        await fetchSnapshots();
      }
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = (id: string) => {
    if (confirm('Bạn có chắc muốn khôi phục lại phiên bản này? Các thay đổi hiện tại sẽ được thay thế.')) {
      onRestore(id);
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/dubbing/${projectId}/snapshots/${id}`, { method: 'DELETE' });
      await fetchSnapshots();
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center space-x-2.5">
            <History className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-base text-white">Lịch Sử Phiên Bản & Undo (Snapshots)</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Create Manual Snapshot */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên bản sao lưu (ví dụ: Trước khi sửa câu 12)..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium px-4 py-2 rounded-lg text-xs transition-all shadow-md shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Snapshot</span>
            </button>
          </div>

          {/* Snapshot List */}
          {snapshots.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs bg-slate-950/50 rounded-lg border border-dashed border-slate-800">
              Chưa có bản lưu snapshot nào. Hệ thống sẽ tự động tạo snapshot trước khi ASR hoặc Dịch.
            </div>
          ) : (
            <div className="space-y-2.5">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between bg-slate-950 p-3.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">{snap.name}</h4>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{new Date(snap.created_at).toLocaleString('vi-VN')}</span>
                        <span className="text-indigo-400">[{snap.snapshot_type}]</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleRestore(snap.id)}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-md text-xs font-medium transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Khôi Phục</span>
                    </button>
                    <button
                      onClick={() => handleDelete(snap.id)}
                      className="p-1.5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-md transition-colors"
                      title="Xóa bản lưu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
