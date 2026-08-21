import React, { useEffect, useRef, useState } from 'react';
import { DubbingProject, GenerationJob, DubbingSegment } from '../types';
import { AudioTimeline } from './AudioTimeline';
import { CharacterManager } from './CharacterManager';
import { SnapshotModal } from './SnapshotModal';
import { audioMixer } from '../services/audioMixer';
import {
  History,
  AlertTriangle,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  Upload,
  Play,
  Volume2,
  RefreshCw,
  Download,
  Users,
  Scissors,
} from 'lucide-react';

type VideoSplitPoint = { time: number; silence_start: number; silence_end: number; silence_duration: number; safe: boolean };

export const DubbingStudio: React.FC = () => {
  const [items, setItems] = useState<DubbingProject[]>([]);
  const [active, setActive] = useState<DubbingProject>();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlayingMixer, setIsPlayingMixer] = useState(false);
  const [showPreviewSubtitles, setShowPreviewSubtitles] = useState(true);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [filterMode, setFilterMode] = useState<'ALL' | 'OVERFLOW' | 'SPEED' | 'OUTDATED' | 'UNVOICED'>('ALL');
  const [seriesFilter, setSeriesFilter] = useState('ALL');
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [splitPoints, setSplitPoints] = useState<VideoSplitPoint[]>([]);
  const [splitAnalyzedFor, setSplitAnalyzedFor] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const load = async (id?: string) => {
    try {
      const [r,seriesResponse] = await Promise.all([fetch('/api/dubbing'),fetch('/api/series')]);
      if (!r.ok) return;
      const list = await r.json() as Array<Pick<DubbingProject, 'id'|'title'|'status'|'progress'|'duration'|'series_name'|'episode_number'|'created_at'|'updated_at'>>;
      if(seriesResponse.ok){const series=await seriesResponse.json();setSeriesOptions(series.map((item:{series_name:string})=>item.series_name));}
      setItems(list as DubbingProject[]);
      const chosenId = id || active?.id || list[0]?.id;
      if (chosenId) {
        const detailResponse = await fetch(`/api/dubbing/${chosenId}`);
        if (detailResponse.ok) setActive(await detailResponse.json());
      }
    } catch (err) {
      console.error('Failed to load dubbing projects:', err);
    }
  };

  useEffect(() => {
    void load();
    const ev = new EventSource('/api/events');
    ev.addEventListener('job', () => void load());
    return () => ev.close();
  }, []);

  const upload = async () => {
    if (!file) return;
    setBusy('upload');
    setError('');
    const form = new FormData();
    form.append('video', file);
    form.append('target_language', 'vi');
    form.append('mode', 'VOICEOVER');
    try {
      const r = await fetch('/api/dubbing', { method: 'POST', body: form });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await load(b.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const job = async (action: 'transcribe' | 'render') => {
    if (!active) return;
    setBusy(action);
    setError('');
    try {
      const r = await fetch(`/api/dubbing/${active.id}/${action}`, { method: 'POST' });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await waitJob(b.job.id);
      await load(active.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const saveImmediate = async (next = active) => {
    if (!next) return;
    setSaveState('saving');
    try {
      setActive(next);
      await fetch(`/api/dubbing/${next.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      setSaveState('saved');
    } catch (err) {
      setSaveState('unsaved');
    }
  };

  const saveDebounced = (next: DubbingProject) => {
    setActive(next);
    setSaveState('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveImmediate(next);
    }, 600);
  };

  const translate = async () => {
    if (!active) return;
    setBusy('translate');
    setError('');
    try {
      const r = await fetch(`/api/dubbing/${active.id}/translate`, { method: 'POST' });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setActive(b);
      audioMixer.clearCache();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const translateMissing = async () => {
    if (!active) return;
    setBusy('translate-missing'); setError('');
    try {
      const response = await fetch(`/api/dubbing/${active.id}/translate-missing`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setActive(body); audioMixer.clearCache();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const preview = async (index: number) => {
    if (!active) return;
    const seg = active.segments[index];
    setBusy(`preview-${seg.id}`);
    setError('');
    try {
      await saveImmediate();
      const r = await fetch(`/api/dubbing/${active.id}/segments/${seg.id}/preview`, { method: 'POST' });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await waitJob(b.job.id);
      const refreshed = await fetch(`/api/dubbing/${active.id}`);
      const updated = await refreshed.json() as DubbingProject;
      if (!refreshed.ok) throw new Error((updated as unknown as {error?:string}).error || 'Không tải lại được project');
      const generated = updated.segments.find(candidate => candidate.id === seg.id);
      if (!generated) throw new Error('Đoạn thoại không còn tồn tại sau khi tạo giọng');
      audioMixer.invalidateVoice(generated.voice_url);
      setActive(updated);
      void audioMixer.preloadSegments([generated]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const analyzeStory = async () => {
    if (!active) return;
    setBusy('story'); setError('');
    try {
      await saveImmediate();
      const r = await fetch(`/api/dubbing/${active.id}/analyze-story`, { method: 'POST' });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setActive(b);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const repairSegments = async () => {
    if (!active) return;
    setBusy('repair'); setError('');
    try {
      await saveImmediate();
      const r = await fetch(`/api/dubbing/${active.id}/repair-segments`, { method: 'POST' });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setActive(b); audioMixer.clearCache();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const splitOverlong = async () => {
    if (!active) return;
    setBusy('split'); setError('');
    try {
      await saveImmediate();
      const r = await fetch(`/api/dubbing/${active.id}/split-overlong-segments`, { method: 'POST' });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setActive(b); audioMixer.clearCache();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const analyzeVideoSplits = async () => {
    if (!active) return;
    setBusy('analyze-video-splits'); setError('');
    try {
      const response = await fetch(`/api/dubbing/${active.id}/analyze-video-splits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_minutes: 8 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSplitPoints(body.points || []); setSplitAnalyzedFor(active.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const createVideoParts = async () => {
    if (!active || !splitPoints.length) return;
    if (splitPoints.some(point => !point.safe)) {
      setError('Còn điểm màu vàng chưa được xác nhận là khoảng nghỉ an toàn. Hãy chỉnh điểm đó hoặc phân tích lại.');
      return;
    }
    setBusy('split-video'); setError('');
    try {
      const response = await fetch(`/api/dubbing/${active.id}/split-video`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cut_points: splitPoints.map(point => point.time) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load(body.parts?.[0]?.id);
      setSplitPoints([]); setSplitAnalyzedFor('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const toggleRealtimeMixer = async () => {
    if (!active || !videoRef.current) return;
    if (isPlayingMixer) {
      videoRef.current.pause();
      audioMixer.stopAll();
      setIsPlayingMixer(false);
    } else {
      setBusy('mixer-buffer');
      // Decode only the nearby voices. Preloading an entire long episode can
      // lock Chrome's main thread and consume hundreds of MB of memory.
      const nearby = active.segments.filter(segment => {
        const start = segment.voice_start ?? segment.start;
        return start >= videoRef.current!.currentTime - 5 && start <= videoRef.current!.currentTime + 90;
      });
      await audioMixer.preloadSegments(nearby);
      audioMixer.setVolumes(active.original_audio_volume, active.voice_volume);
      audioMixer.playTimeline(active.segments, videoRef.current.currentTime);
      void videoRef.current.play();
      setIsPlayingMixer(true);
      setBusy('');
    }
  };

  const handleVideoSeek = (time: number) => {
    if (!videoRef.current) return;
    // Only timeline clicks set the media position. Native `seeked` must not
    // call this function again or it creates a seek -> seeked loop.
    if (Math.abs(videoRef.current.currentTime - time) > 0.05) {
      videoRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current && active && isPlayingMixer) {
      const isVoiceSpeaking = active.segments.some((seg) => {
        if (!seg.enabled || !seg.voice_url) return false;
        const vStart = seg.voice_start ?? seg.start;
        const vEnd = vStart + (seg.voice_duration || (seg.end - seg.start));
        return time >= vStart && time <= vEnd;
      });
      const targetVol = isVoiceSpeaking ? active.original_audio_volume * 0.3 : active.original_audio_volume;
      videoRef.current.volume = Math.max(0, Math.min(1, targetVol));
    }
  };

  const stopRealtimeMixer = () => {
    audioMixer.stopAll();
    setIsPlayingMixer(false);
    if (videoRef.current && active) {
      videoRef.current.volume = Math.max(0, Math.min(1, active.original_audio_volume));
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!active) return;
    try {
      const res = await fetch(`/api/dubbing/${active.id}/snapshots/${snapshotId}/restore`, { method: 'POST' });
      if (res.ok) {
        const restored = await res.json();
        setActive(restored);
        audioMixer.clearCache();
      }
    } catch (err) {
      console.error('Failed to restore snapshot:', err);
    }
  };

  const pageSize = 30;
  const filteredSegments = (active?.segments || []).filter((seg, idx) => {
    if (filterMode === 'OVERFLOW') return (seg.voice_overflow || 0) > 0;
    if (filterMode === 'SPEED') return (seg.voice_speed || 1) > 1.25;
    if (filterMode === 'OUTDATED') return seg.voice_outdated;
    if (filterMode === 'UNVOICED') return !seg.voice_url;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const matchesId = `seg-${idx + 1}`.includes(term) || String(idx + 1) === term;
    const matchesSpeaker = seg.speaker?.toLowerCase().includes(term);
    const matchesSource = seg.source_text.toLowerCase().includes(term);
    const matchesTrans = seg.translated_text.toLowerCase().includes(term);
    return matchesId || matchesSpeaker || matchesSource || matchesTrans;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSegments.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const paginatedSegments = filteredSegments.slice((pageIndex - 1) * pageSize, pageIndex * pageSize);

  const liveSubtitle = active?.segments.find((seg) => seg.enabled && currentTime >= seg.start && currentTime <= seg.end);

  return (
    <div className="space-y-6 animate-fadeIn text-slate-100">
      {/* Header & Title */}
      <header className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
            <span>Dịch & Lồng Tiếng Video Pro</span>
            <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
              Pyannote Diarization Ready
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Tự động tách nhân vật, nghe thử timeline realtime mixer, lưu lịch sử phiên bản & chống mất dữ liệu.
          </p>
        </div>

        {/* Header Actions */}
        {active && (
          <div className="flex items-center space-x-3">
            {/* Save indicator */}
            <div className="flex items-center space-x-1.5 text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              {saveState === 'saving' && <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
              {saveState === 'saved' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              {saveState === 'unsaved' && <Clock className="w-3.5 h-3.5 text-amber-400" />}
              <span className={saveState === 'saved' ? 'text-emerald-400' : 'text-amber-400'}>
                {saveState === 'saving' ? 'Đang lưu...' : saveState === 'saved' ? 'Đã lưu' : 'Chưa lưu'}
              </span>
            </div>

            {/* Undo / Snapshot Button */}
            <button
              onClick={() => setShowSnapshotModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-all"
            >
              <History className="w-4 h-4 text-indigo-400" />
              <span>Lịch Sử Phiên Bản</span>
            </button>
          </div>
        )}
      </header>

      {/* 5-Step Guided Workflow Banner (CapCap & pyVideoTrans Workflow) */}
      {active && (
        <div className="grid grid-cols-5 gap-2 text-xs font-medium bg-slate-900 border border-slate-800 p-2 rounded-xl text-center shadow-lg">
          <div className={`py-1.5 px-2 rounded-lg transition-all ${active.status === 'UPLOADED' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-950 text-slate-400'}`}>
            1. Nạp Video ✔️
          </div>
          <div className={`py-1.5 px-2 rounded-lg transition-all ${active.status === 'TRANSCRIBING' ? 'bg-indigo-600 text-white font-bold animate-pulse' : active.segments.length ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-slate-950 text-slate-400'}`}>
            2. Nhận Dạng ASR {active.segments.length ? '✔️' : ''}
          </div>
          <div className={`py-1.5 px-2 rounded-lg transition-all ${active.story_summary ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-slate-950 text-slate-400'}`}>
            3. Dịch Cốt Truyện {active.story_summary ? '✔️' : ''}
          </div>
          <div className={`py-1.5 px-2 rounded-lg transition-all ${active.status === 'GENERATING_VOICE' ? 'bg-indigo-600 text-white font-bold animate-pulse' : active.segments.some(s => s.voice_url) ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-slate-950 text-slate-400'}`}>
            4. Tạo Giọng TTS {active.segments.some(s => s.voice_url) ? '✔️' : ''}
          </div>
          <div className={`py-1.5 px-2 rounded-lg transition-all ${active.status === 'COMPLETED' ? 'bg-emerald-600 text-white font-bold' : active.status === 'RENDERING' ? 'bg-indigo-600 text-white font-bold animate-pulse' : 'bg-slate-950 text-slate-400'}`}>
            5. Xuất Video MP4 {active.status === 'COMPLETED' ? '✔️' : ''}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row gap-3">
          <label className="flex-1 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-lg p-4 text-sm text-slate-300 cursor-pointer transition-colors flex items-center justify-center space-x-3">
            <Upload className="w-5 h-5 text-indigo-400" />
            <input type="file" accept="video/mp4" className="hidden" onChange={(e) => setFile(e.target.files?.[0])} />
            <span>{file ? file.name : 'Kéo thả hoặc Chọn file MP4 cần lồng tiếng'}</span>
          </label>
          <button
            disabled={!file || !!busy}
            onClick={upload}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium rounded-lg px-6 py-3 text-sm transition-all shadow-md active:scale-95"
          >
            {busy === 'upload' ? 'Đang Tải Upline...' : 'Tải Video Lên'}
          </button>
        </div>
      </section>

      {error && <div className="bg-rose-950/40 border border-rose-700 text-rose-200 p-3.5 rounded-xl text-sm">{error}</div>}

      <div className="grid lg:col-span-12 gap-5 grid-cols-1 lg:grid-cols-12">
        {/* Sidebar Project List */}
        <aside className="lg:col-span-3 space-y-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Danh Sách Dự Án</h3>
            <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)} className="max-w-36 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300">
              <option value="ALL">Tất cả series</option>
              {Array.from(new Set(items.map((item) => item.series_name).filter(Boolean))).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          {items.filter((item) => seriesFilter === 'ALL' || item.series_name === seriesFilter).map((x) => (
            <button
              key={x.id}
              onClick={() => {
                audioMixer.clearCache();
                void load(x.id);
              }}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                active?.id === x.id
                  ? 'border-indigo-500 bg-indigo-500/10 text-white'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
              }`}
            >
              <b className="text-sm font-semibold block truncate">{x.title}</b>
              <span className="text-[11px] text-slate-400 mt-1 block font-mono">
                {x.status} • {format(x.duration)}
              </span>
              {x.series_name && <span className="text-[10px] text-indigo-300 mt-1 block truncate">{x.series_name}{x.episode_number ? ` • Tập ${x.episode_number}` : ''}</span>}
            </button>
          ))}
        </aside>

        {/* Main Content Area */}
        {active ? (
          <main className="lg:col-span-9 space-y-5">
            {/* Pre-processing: split long source video before expensive ASR/TTS work. */}
            <section className="rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-4 shadow-lg">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-cyan-100"><Scissors className="h-4 w-4" /> Bước 1 — Chia video dài trước khi xử lý</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Dò khoảng nghỉ tự nhiên gần mỗi 8 phút (giới hạn 5–10 phút), không cắt giữa câu thoại. Video gốc luôn được giữ lại.
                  </p>
                </div>
                <button
                  disabled={!!busy || active.duration <= 600}
                  onClick={analyzeVideoSplits}
                  className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
                >
                  {busy === 'analyze-video-splits' ? 'Đang nghe khoảng nghỉ...' : active.duration <= 600 ? 'Video ≤ 10 phút — không cần chia' : 'Phân tích điểm cắt an toàn'}
                </button>
              </div>

              {active.segments.length > 0 && active.duration > 600 && (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  Project đã có transcript nên hệ thống sẽ đối chiếu cả khoảng trống giữa các câu để tránh cắt ngang thoại. Project hiện tại vẫn được giữ nguyên.
                </div>
              )}

              {splitAnalyzedFor === active.id && (
                <div className="mt-4 space-y-3 border-t border-slate-800 pt-3">
                  {splitPoints.length ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-2">
                        {splitPoints.map((point, index) => (
                          <div key={`${index}-${point.time}`} className={`rounded-lg border p-3 ${point.safe ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-white">Cuối phần {index + 1}: {formatPrecise(point.time)}</span>
                              <span className={`text-[10px] font-semibold ${point.safe ? 'text-emerald-300' : 'text-amber-300'}`}>{point.safe ? `Khoảng nghỉ ${point.silence_duration.toFixed(2)}s` : 'Cần kiểm tra thủ công'}</span>
                            </div>
                            <input
                              type="range" min={Math.max(30, point.time - 30)} max={Math.min(active.duration - 30, point.time + 30)} step="0.1" value={point.time}
                              onChange={(event) => setSplitPoints(points => points.map((item, itemIndex) => itemIndex === index ? { ...item, time: Number(event.target.value), safe: Number(event.target.value) >= item.silence_start && Number(event.target.value) <= item.silence_end && item.silence_duration > 0 } : item))}
                              className="mt-2 w-full accent-cyan-500"
                            />
                            <p className="mt-1 text-[10px] text-slate-500">Kéo trong ±30 giây. Màu xanh nghĩa là mốc vẫn nằm trong khoảng im lặng đã dò.</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-slate-400">Sẽ tạo {splitPoints.length + 1} project con; series và số tập được kế thừa.</p>
                        <button disabled={!!busy || splitPoints.some(point => !point.safe)} onClick={createVideoParts} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-40">
                          {busy === 'split-video' ? 'Đang tạo các phần...' : `Xác nhận chia ${splitPoints.length + 1} phần`}
                        </button>
                      </div>
                    </>
                  ) : <p className="text-xs text-emerald-300">Video này chưa cần chia.</p>}
                </div>
              )}
            </section>
            {/* Top Video Preview + Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid md:grid-cols-2 gap-5 shadow-xl">
              <div className="relative overflow-hidden rounded-lg bg-black self-start">
                <video
                  ref={videoRef}
                  src={active.source_video_url}
                  controls
                  onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
                  onSeeked={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
                  onPause={stopRealtimeMixer}
                  onEnded={() => {
                    stopRealtimeMixer();
                  }}
                  className="w-full bg-black max-h-72"
                />
                {active.blur_source_text !== false && (
                  <div
                    className="absolute pointer-events-none border border-amber-300/70 bg-black/35 backdrop-blur-md"
                    style={{
                      left: `${active.source_text_blur_x ?? 0}%`,
                      top: `${active.source_text_blur_y ?? 70}%`,
                      width: `${active.source_text_blur_width ?? 100}%`,
                      height: `${active.source_text_blur_height ?? 30}%`,
                    }}
                  >
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">Vùng che chữ gốc</span>
                  </div>
                )}
                {showPreviewSubtitles && liveSubtitle && (
                  <div
                    className="absolute left-4 right-4 z-10 text-center pointer-events-none"
                    style={{ top: `${active.subtitle_position ?? 78}%`, transform: 'translateY(-50%)' }}
                  >
                    <span
                      className="inline box-decoration-clone bg-black/75 px-3 py-1.5 rounded-md text-white text-sm md:text-base font-semibold shadow-lg border border-slate-800"
                      style={{ textShadow: '0 1px 3px #000' }}
                    >
                      {liveSubtitle.translated_text}
                    </span>
                  </div>
                )}
                <div className="absolute top-2 right-2 z-20 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowPreviewSubtitles((value) => !value)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold backdrop-blur ${showPreviewSubtitles ? 'border-emerald-400/60 bg-emerald-950/80 text-emerald-200' : 'border-slate-600 bg-black/75 text-slate-300'}`}
                  >
                    Preview Sub: {showPreviewSubtitles ? 'Bật' : 'Tắt'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveImmediate({ ...active, burn_subtitles: !active.burn_subtitles })}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold backdrop-blur ${active.burn_subtitles ? 'border-indigo-400/60 bg-indigo-950/80 text-indigo-200' : 'border-slate-600 bg-black/75 text-slate-300'}`}
                  >
                    Sub MP4: {active.burn_subtitles ? 'Bật' : 'Tắt'}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white truncate">{active.title}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-slate-400">
                    Ngôn Ngữ Nguồn
                    <select
                      value={active.source_language}
                      onChange={(e) => saveImmediate({ ...active, source_language: e.target.value })}
                      className="block w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                    >
                      <option value="auto">Tự nhận diện</option>
                      <option value="en">English</option>
                      <option value="vi">Tiếng Việt</option>
                      <option value="zh">中文 (Trung Quốc)</option>
                      <option value="ja">日本語</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium text-slate-400">
                    Chế Độ Xuất
                    <select
                      value={active.mode}
                      onChange={(e) => saveImmediate({ ...active, mode: e.target.value as any })}
                      className="block w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                    >
                      <option value="SUBTITLES">Chỉ Phụ Đề</option>
                      <option value="VOICEOVER">Thuyết Minh</option>
                      <option value="DUB">Lồng Tiếng</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-slate-400 block">
                    Giọng thuyết minh
                    <select
                      value={active.voice_profile ?? 'co-gai-hoat-ngon'}
                      onChange={(e) => saveImmediate({ ...active, voice_profile: e.target.value as DubbingProject['voice_profile'] })}
                      className="block w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                    >
                      <option value="co-gai-hoat-ngon">Cô gái hoạt ngôn (CapCut Clone)</option>
                      <option value="vi-VN-HoaiMyNeural">Hoài Mỹ (Edge-TTS Neural)</option>
                      <option value="vi-VN-NamMinhNeural">Nam Minh (Edge-TTS Neural)</option>
                      <option value="default">VieNeu mặc định</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium text-slate-400 block">
                    Khớp khẩu hình (Offset): {active.voice_delay_ms ?? 50}ms
                    <input
                      type="range"
                      min="0"
                      max="300"
                      step="25"
                      value={active.voice_delay_ms ?? 50}
                      onChange={(e) => setActive({ ...active, voice_delay_ms: Number(e.target.value) })}
                      onMouseUp={() => void saveImmediate()}
                      className="block w-full mt-2.5 accent-indigo-500"
                    />
                  </label>
                </div>

                <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-2.5">
                  <label className="flex items-center gap-2 text-xs font-semibold text-indigo-200">
                    <input
                      type="checkbox"
                      checked={active.keep_original_bgm !== false}
                      onChange={(e) => void saveImmediate({ ...active, keep_original_bgm: e.target.checked })}
                      className="accent-indigo-500"
                    />
                    Giữ nhạc nền & tiếng động gốc (CapCap BGM Retention)
                  </label>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_90px] gap-2">
                    <label className="text-xs font-medium text-slate-400">
                      Series
                      <input
                        value={active.series_name ?? ''}
                        list="known-series"
                        placeholder="Ví dụ: Ngôi nhà kỳ lạ"
                        onChange={(e) => saveDebounced({ ...active, series_name: e.target.value })}
                        className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                      />
                      <datalist id="known-series">{seriesOptions.map(name=><option key={name} value={name}/>)}</datalist>
                    </label>
                    <label className="text-xs font-medium text-slate-400">
                      Tập
                      <input
                        type="number" min="1" value={active.episode_number ?? ''}
                        onChange={(e) => saveDebounced({ ...active, episode_number: Number(e.target.value) || undefined })}
                        className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white"
                      />
                    </label>
                  </div>
                  <button
                    disabled={!active.segments.length || !!busy}
                    onClick={analyzeStory}
                    className="w-full rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-2 text-xs font-medium text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-40"
                  >
                    {busy === 'story' ? 'Đang đọc toàn bộ cốt truyện...' : active.story_context ? 'Phân tích lại cốt truyện & Series' : 'Phân tích cốt truyện trước khi dịch'}
                  </button>
                  {active.story_summary && <p className="text-[11px] leading-relaxed text-slate-400 line-clamp-3" title={active.story_summary}>{active.story_summary}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-slate-400 block">
                    Âm lượng video gốc: {Math.round(active.original_audio_volume * 100)}%
                    <input type="range" min="0" max="1" step=".05" value={active.original_audio_volume}
                      onChange={(e) => {
                        const value=Number(e.target.value);setActive({ ...active, original_audio_volume:value });
                        audioMixer.setVolumes(value,active.voice_volume);if(videoRef.current)videoRef.current.volume=value;
                      }} onMouseUp={() => void saveImmediate()} className="block w-full mt-1.5 accent-indigo-500" />
                  </label>
                  <label className="text-xs font-medium text-slate-400 block">
                    Âm lượng thuyết minh: {Math.round(active.voice_volume * 100)}%
                    <input type="range" min="0" max="1.5" step=".05" value={active.voice_volume}
                      onChange={(e) => {
                        const value=Number(e.target.value);setActive({ ...active, voice_volume:value });
                        audioMixer.setVolumes(active.original_audio_volume,value);
                      }} onMouseUp={() => void saveImmediate()} className="block w-full mt-1.5 accent-emerald-500" />
                  </label>
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                    <input type="checkbox" checked={active.blur_source_text !== false} onChange={(e) => void saveImmediate({ ...active, blur_source_text: e.target.checked })} className="accent-amber-500" />
                    Làm mờ chữ/phụ đề Trung Quốc trước khi xuất
                  </label>
                  {active.blur_source_text !== false && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {([
                        ['Vị trí ngang', 'source_text_blur_x', 0, 95, active.source_text_blur_x ?? 0],
                        ['Vị trí dọc', 'source_text_blur_y', 0, 95, active.source_text_blur_y ?? 70],
                        ['Chiều rộng', 'source_text_blur_width', 5, 100, active.source_text_blur_width ?? 100],
                        ['Chiều cao', 'source_text_blur_height', 5, 50, active.source_text_blur_height ?? 30],
                        ['Độ mờ', 'source_text_blur_strength', 2, 30, active.source_text_blur_strength ?? 12],
                      ] as const).map(([label, key, min, max, value]) => (
                        <label key={key} className={`text-[11px] text-slate-400 ${key === 'source_text_blur_strength' ? 'col-span-2' : ''}`}>
                          {label}: {value}{key === 'source_text_blur_strength' ? '' : '%'}
                          <input type="range" min={min} max={max} value={value} onChange={(e) => saveDebounced({ ...active, [key]: Number(e.target.value) })} className="block w-full accent-amber-500" />
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] leading-relaxed text-slate-500">Khung vàng là vùng sẽ được làm mờ. Kéo khung phủ đúng chữ gốc; phụ đề Việt được chèn sau nên vẫn sắc nét.</p>
                </div>

                <div className="flex flex-wrap gap-4 text-xs">
                  <button
                    onClick={() => setShowCharacters(!showCharacters)}
                    className="flex items-center space-x-1.5 text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <Users className="w-4 h-4" />
                    <span>{showCharacters ? 'Ẩn Cấu Hình Giọng Nhân Vật' : 'Cấu Hình Giọng Nhân Vật (Multi-Speaker)'}</span>
                  </button>
                </div>

                {/* Progress bar & main triggers */}
                <div className="space-y-2 pt-2">
                  {active.status_message && (
                    <div className="flex items-center justify-between text-[11px] font-mono text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 px-3 py-1.5 rounded-lg">
                      <span className="truncate">{active.status_message}</span>
                      <span className="font-bold shrink-0 ml-2">{active.progress}%</span>
                    </div>
                  )}

                  <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${active.progress}%` }} />
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={!!busy}
                      onClick={() => job('transcribe')}
                      className="flex-1 py-2 px-3 border border-indigo-500/50 hover:bg-indigo-500/10 text-indigo-300 rounded-lg text-xs font-medium transition-all"
                    >
                      {busy === 'transcribe' ? 'WhisperX + Pyannote...' : active.segments.length ? 'Nhận Dạng Lại' : 'Nhận Dạng Lời Nói'}
                    </button>
                    <button
                      disabled={!active.segments.length || !!busy}
                      onClick={() => job('render')}
                      className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-all shadow-md disabled:opacity-40"
                    >
                      {busy === 'render' ? 'Đang Xuất MP4...' : 'Xuất Video MP4 Hoàn Chỉnh'}
                    </button>
                  </div>

                  {active.output_video_url && (
                    <a
                      href={active.output_video_url}
                      download
                      className="flex items-center justify-center space-x-1.5 w-full py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <span>Tải Video MP4 Đã Hoàn Tất ↓</span>
                    </a>
                  )}
                  {active.render_warning && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">{active.render_warning}</p>}
                </div>
              </div>
            </div>

            {/* Character Manager Collapsible Section */}
            {showCharacters && (
              <CharacterManager
                project={active}
                onUpdateProject={(updated) => {
                  const next = { ...active, ...updated };
                  setActive(next);
                  void saveImmediate(next);
                }}
              />
            )}

            {/* Interactive Realtime Audio Timeline */}
            {active.segments.length > 0 && (
              <AudioTimeline
                duration={active.duration}
                currentTime={currentTime}
                isPlaying={isPlayingMixer}
                segments={active.segments}
                onSeek={handleVideoSeek}
                onTogglePlay={toggleRealtimeMixer}
                selectedSegmentId={undefined}
              />
            )}

            {/* Main Transcript Table & Review Hub Filter */}
            {active.segments.length > 0 && (
              <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                {/* Table Header + Filter Toolbar */}
                <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950">
                  <div>
                    <h3 className="text-white font-bold text-sm flex items-center space-x-2">
                      <span>Transcript & Thoại ({active.segments.length} đoạn)</span>
                      {active.asr_engine && (
                        <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                          {active.asr_engine}
                        </span>
                      )}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search input */}
                    <input
                      type="text"
                      placeholder="🔍 Tìm thoại / nhân vật..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44"
                    />

                    {/* Review Filter Buttons */}
                    <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                      <button
                        onClick={() => { setFilterMode('ALL'); setCurrentPage(1); }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          filterMode === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Tất Cả
                      </button>
                      <button
                        onClick={() => { setFilterMode('OUTDATED'); setCurrentPage(1); }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          filterMode === 'OUTDATED' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Hết Hạn ⚠️
                      </button>
                      <button
                        onClick={() => { setFilterMode('OVERFLOW'); setCurrentPage(1); }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          filterMode === 'OVERFLOW' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Tràn Khung 🔴
                      </button>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center space-x-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono">
                        <button
                          disabled={pageIndex <= 1}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className="disabled:opacity-30 hover:text-indigo-400 font-bold px-1"
                        >
                          ◀
                        </button>
                        <span>
                          {pageIndex}/{totalPages}
                        </span>
                        <button
                          disabled={pageIndex >= totalPages}
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          className="disabled:opacity-30 hover:text-indigo-400 font-bold px-1"
                        >
                          ▶
                        </button>
                      </div>
                    )}

                    <button
                      disabled={!!busy}
                      onClick={translate}
                      className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-all"
                    >
                      {busy === 'translate' ? 'Gemini Đang Dịch...' : 'Dịch Tự Động (Gemini Pro)'}
                    </button>
                    <button
                      disabled={!active.segments.some(segment => segment.enabled && /[\u3400-\u9fff]/u.test(segment.translated_text || '')) || !!busy}
                      onClick={translateMissing}
                      className="px-3.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                    >
                      {busy === 'translate-missing' ? 'Đang dịch đoạn thiếu...' : 'Dịch đoạn còn thiếu'}
                    </button>
                    <button
                      disabled={!active.segments.length || !!busy}
                      onClick={repairSegments}
                      className="px-3.5 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-200 border border-cyan-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                    >
                      {busy === 'repair' ? 'Đang ghép câu...' : 'Ghép câu bị cắt'}
                    </button>
                    <button
                      disabled={!active.segments.length || !!busy}
                      onClick={splitOverlong}
                      className="px-3.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                    >
                      {busy === 'split' ? 'Đang tách đoạn...' : 'Tách đoạn quá dài (>6.5s)'}
                    </button>
                  </div>
                </div>

                {/* Segments List */}
                <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-800/80 custom-scrollbar">
                  {paginatedSegments.map((seg) => {
                    const originalIndex = active.segments.indexOf(seg);
                    return (
                      <div key={seg.id} className="p-4 space-y-3 hover:bg-slate-800/20 transition-colors">
                        <div className="grid md:grid-cols-[160px_1fr_1fr] gap-4">
                          <div className="text-[11px] text-slate-400 font-mono space-y-1.5">
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={seg.enabled}
                                onChange={(e) => {
                                  const s = [...active.segments];
                                  s[originalIndex] = { ...seg, enabled: e.target.checked };
                                  saveDebounced({ ...active, segments: s });
                                }}
                                className="accent-indigo-500"
                              />
                              <span className="font-bold text-white">Đoạn {originalIndex + 1}</span>
                              {seg.speaker && (
                                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded text-[10px]">
                                  {seg.speaker}
                                </span>
                              )}
                            </label>
                            <span className="block text-slate-400">
                              Thoại gốc: {formatPrecise(seg.start)}–{formatPrecise(seg.end)}
                            </span>

                            <label className="block pt-1">
                              Tốc độ: {(seg.voice_speed ?? 1).toFixed(2)}×
                              <input
                                type="range"
                                min="0.7"
                                max="1.8"
                                step="0.05"
                                value={seg.voice_speed ?? 1}
                                onChange={(e) => {
                                  const s = [...active.segments];
                                  s[originalIndex] = { ...seg, voice_speed: Number(e.target.value) };
                                  saveDebounced({ ...active, segments: s });
                                }}
                                className="w-full accent-emerald-500 mt-1"
                              />
                            </label>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Transcript Gốc</label>
                            <textarea
                              value={seg.source_text}
                              readOnly
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-400 resize-y focus:outline-none"
                              rows={3}
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-medium text-slate-400">Bản Dịch Tiếng Việt</label>
                              {seg.voice_outdated && (
                                <span className="text-[10px] text-amber-400 flex items-center space-x-1 font-semibold">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Cần tạo lại voice</span>
                                </span>
                              )}
                            </div>
                            <textarea
                              value={seg.translated_text}
                              onChange={(e) => {
                                const s = [...active.segments];
                                s[originalIndex] = {
                                  ...seg,
                                  translated_text: e.target.value,
                                  voice_outdated: true,
                                  compressed_text: undefined,
                                };
                                saveDebounced({ ...active, segments: s });
                              }}
                              className={`w-full bg-slate-950 border rounded-lg p-2.5 text-xs text-white resize-y focus:outline-none ${
                                seg.voice_outdated ? 'border-amber-500/70' : 'border-slate-700 focus:border-indigo-500'
                              }`}
                              rows={3}
                            />
                          </div>
                        </div>

                        {/* Audio Actions */}
                        <div className="flex items-center gap-3 pl-0 md:pl-[176px]">
                          <button
                            disabled={!!busy}
                            onClick={() => preview(originalIndex)}
                            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-md text-xs font-medium transition-all"
                          >
                            {busy === `preview-${seg.id}` ? 'Đang tạo...' : 'Tạo / Cập Nhật Giọng Thử (VieNeu)'}
                          </button>

                          {seg.voice_url && <audio src={seg.voice_url} controls className="h-8 max-w-xs" />}
                          {seg.voice_duration && <span className="text-[10px] text-slate-400 font-mono">Dài {seg.voice_duration.toFixed(2)}s</span>}
                          {(seg.voice_timeline_shift ?? 0) > 0.03 && <span className="text-[10px] text-cyan-300 font-mono">Dời +{seg.voice_timeline_shift!.toFixed(2)}s để tránh chồng</span>}
                          {seg.voice_words_per_second && <span className="text-[10px] text-slate-400 font-mono">{seg.voice_words_per_second.toFixed(1)} từ/s</span>}
                          {seg.timing_quality === 'NATURAL' && <span className="text-[10px] text-emerald-400">Nhịp tự nhiên</span>}
                          {seg.timing_quality === 'ADJUSTED' && <span className="text-[10px] text-amber-400">Đã cân nhịp</span>}
                          {seg.compressed_text && <span className="text-[10px] text-indigo-300" title={seg.compressed_text}>Đã rút gọn lời đọc</span>}
                          {(seg.voice_overflow ?? 0) > 0.03 && (
                            <span className="text-[10px] text-rose-400 font-medium">Tràn khung {(seg.voice_overflow ?? 0).toFixed(2)}s</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </main>
        ) : (
          <div className="lg:col-span-9 text-slate-500 text-sm p-12 text-center bg-slate-900 border border-slate-800 rounded-xl">
            Tải video MP4 lên để bắt đầu dịch & lồng tiếng.
          </div>
        )}
      </div>

      {/* Snapshot / Undo Modal */}
      {active && (
        <SnapshotModal
          isOpen={showSnapshotModal}
          onClose={() => setShowSnapshotModal(false)}
          projectId={active.id}
          onRestore={handleRestoreSnapshot}
        />
      )}
    </div>
  );
};

async function waitJob(id: string) {
  return new Promise<void>((resolve, reject) => {
    const ev = new EventSource(`/api/jobs/${id}/events`);
    const timeout = setTimeout(() => {
      ev.close();
      reject(new Error('Tác vụ quá thời gian'));
    // Long episodes can require hours when VieNeu runs on CPU. The server job
    // continues independently, so keep the browser observer alive long enough
    // instead of falsely reporting a timeout after 30 minutes.
    }, 6 * 60 * 60_000);
    ev.addEventListener('job', (event) => {
      const j = JSON.parse((event as MessageEvent).data) as GenerationJob;
      if (j.status === 'COMPLETED' || j.status === 'FAILED') {
        clearTimeout(timeout);
        ev.close();
        j.status === 'COMPLETED' ? resolve() : reject(new Error(j.error_message || 'Tác vụ thất bại'));
      }
    });
  });
}

const format = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const formatPrecise = (s: number) => `${Math.floor(s / 60)}:${String((s % 60).toFixed(2)).padStart(5, '0')}`;
