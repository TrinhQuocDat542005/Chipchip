import React, { useRef, useState } from 'react';
import { DubbingSegment } from '../types';
import { Play, Pause, ZoomIn, ZoomOut, RotateCcw, AlertTriangle } from 'lucide-react';

interface AudioTimelineProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  segments: DubbingSegment[];
  onSeek: (timeSeconds: number) => void;
  onTogglePlay: () => void;
  onSelectSegment?: (segmentId: string) => void;
  selectedSegmentId?: string;
}

export const AudioTimeline: React.FC<AudioTimelineProps> = ({
  duration,
  currentTime,
  isPlaying,
  segments,
  onSeek,
  onTogglePlay,
  onSelectSegment,
  selectedSegmentId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1); // 1x to 4x

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const playheadPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      {/* Controls Header */}
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={onTogglePlay}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition-all shadow-md active:scale-95"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? 'Tạm Dừng' : 'Phát Realtime Mixer'}</span>
          </button>

          <div className="text-xs font-mono bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800 text-indigo-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Legend & Zoom */}
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span className="text-slate-400">Sẵn Sàng</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
            <span className="text-slate-400">Hết Hạn ⚠️</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
            <span className="text-slate-400">Tràn Thời Gian</span>
          </div>

          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1.5 text-indigo-400">{zoom}x</span>
            <button
              onClick={() => setZoom(Math.min(4, zoom + 0.5))}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              title="Phóng to"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Timeline Scroll Track */}
      <div className="overflow-x-auto custom-scrollbar">
        <div
          ref={containerRef}
          onClick={handleTimelineClick}
          className="relative h-28 bg-slate-950 rounded-lg cursor-pointer select-none border border-slate-800/80 overflow-hidden"
          style={{ width: `${100 * zoom}%` }}
        >
          {/* Time ticks ruler */}
          <div className="absolute top-0 left-0 right-0 h-5 bg-slate-900/80 border-b border-slate-800 flex justify-between px-2 text-[10px] font-mono text-slate-500">
            {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => (
              <span key={ratio}>{formatTime(duration * ratio)}</span>
            ))}
          </div>

          {/* Segment Blocks */}
          <div className="absolute top-6 bottom-0 left-0 right-0 px-1 py-1">
            {segments.map((seg) => {
              const startPct = duration > 0 ? (seg.start / duration) * 100 : 0;
              const widthPct = duration > 0 ? Math.max(0.5, ((seg.end - seg.start) / duration) * 100) : 0;
              const isSelected = selectedSegmentId === seg.id;

              let bgColor = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
              if (!seg.enabled) {
                bgColor = 'bg-slate-800/30 border-slate-700/30 text-slate-500 line-through';
              } else if (seg.voice_outdated) {
                bgColor = 'bg-amber-500/30 border-amber-500/70 text-amber-300';
              } else if ((seg.voice_overflow || 0) > 0) {
                bgColor = 'bg-rose-500/30 border-rose-500/70 text-rose-300';
              }

              return (
                <div
                  key={seg.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSegment?.(seg.id);
                    onSeek(seg.start);
                  }}
                  className={`absolute top-1 bottom-1 rounded-md border px-2 py-1 flex items-center justify-between text-xs transition-all ${bgColor} ${
                    isSelected ? 'ring-2 ring-indigo-400 border-indigo-400 z-10' : 'hover:border-indigo-400/80'
                  }`}
                  style={{
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                  }}
                >
                  <span className="truncate font-medium text-[11px]">
                    {seg.speaker ? `${seg.speaker}: ` : ''}
                    {seg.translated_text || seg.source_text}
                  </span>
                  {seg.voice_outdated && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 ml-1" />}
                </div>
              );
            })}
          </div>

          {/* Playhead Vertical Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.8)]"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="w-3 h-3 bg-rose-500 rounded-full -ml-1.25 -mt-0.5 shadow-md"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
