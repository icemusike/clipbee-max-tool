import { useRef, useCallback, useEffect } from 'react';
import {
  Minus, Plus, Magnet, Scissors, Film, Music, GripVertical, ArrowRight,
} from 'lucide-react';
import useStore from '../store';

function formatTimeShort(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CLIP_COLORS = ['#E8920D', '#F5C518', '#22C55E', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function Timeline() {
  const {
    clips, timelineClips, zoomLevel, setZoomLevel,
    snapEnabled, toggleSnap, isPlaying, currentTime,
    selectedTransition, autoTransitions,
    playheadPosition, setPlayheadPosition,
  } = useStore();

  const trackRef = useRef(null);
  const totalDuration = timelineClips.reduce((acc, c) => acc + c.duration, 0);

  // Generate time ruler marks
  const timeMarks = [];
  if (totalDuration > 0) {
    const interval = totalDuration <= 30 ? 5 : totalDuration <= 120 ? 15 : 30;
    for (let t = 0; t <= totalDuration; t += interval) {
      timeMarks.push(t);
    }
    if (timeMarks[timeMarks.length - 1] < totalDuration) {
      timeMarks.push(Math.ceil(totalDuration));
    }
  } else {
    for (let t = 0; t <= 180; t += 30) timeMarks.push(t);
  }

  const handleTrackClick = useCallback((e) => {
    if (!trackRef.current || totalDuration === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    setPlayheadPosition(percent * totalDuration);
  }, [totalDuration, setPlayheadPosition]);

  const playheadPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Calculate widths for each clip on the timeline
  const getClipWidth = (duration) => {
    if (totalDuration === 0) return 0;
    return (duration / totalDuration) * 100;
  };

  const handleSplit = () => {
    // Split at current playhead position - placeholder
    console.log('Split at', currentTime);
  };

  return (
    <div className="flex flex-col bg-cb-timeline border-t border-cb-border shrink-0" style={{ height: 180 }}>
      {/* Timeline Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-grotesk text-sm font-semibold text-white">Timeline</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoomLevel(zoomLevel - 25)}
              className="w-6 h-6 rounded flex items-center justify-center bg-cb-surface-light text-cb-text-secondary hover:text-white transition-colors"
            >
              <Minus size={12} />
            </button>
            <span className="text-[11px] text-cb-text-muted w-8 text-center">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(zoomLevel + 25)}
              className="w-6 h-6 rounded flex items-center justify-center bg-cb-surface-light text-cb-text-secondary hover:text-white transition-colors"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSnap}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              snapEnabled
                ? 'bg-cb-surface-light text-cb-yellow'
                : 'bg-cb-surface-light text-cb-text-secondary'
            }`}
          >
            <Magnet size={12} />
            Snap
          </button>
          <button
            onClick={handleSplit}
            className="flex items-center gap-1 px-2 py-1 rounded bg-cb-surface-light text-cb-text-secondary text-[11px] font-medium hover:text-white transition-colors"
          >
            <Scissors size={12} />
            Split
          </button>
        </div>
      </div>

      {/* Time Ruler */}
      <div className="flex items-center h-5 px-4">
        {timeMarks.map((t, i) => (
          <div key={t} className={`flex items-center ${i < timeMarks.length - 1 ? 'flex-1' : ''}`}>
            <span className="text-[9px] text-cb-text-muted font-inter">{formatTimeShort(t)}</span>
            {i < timeMarks.length - 1 && <div className="flex-1" />}
          </div>
        ))}
      </div>

      {/* Playhead Line */}
      <div className="relative h-0.5 mx-4">
        <div
          className="absolute top-0 w-0.5 h-full bg-cb-yellow"
          style={{ left: `${playheadPercent}%` }}
        />
      </div>

      {/* Track Area */}
      <div className="flex flex-col gap-1.5 flex-1 px-4 py-1 min-h-0" ref={trackRef} onClick={handleTrackClick}>
        {/* Video Track */}
        <div className="flex items-center h-full">
          <div className="flex items-center justify-center w-[60px] h-full shrink-0">
            <Film size={14} className="text-cb-text-muted mr-1" />
            <span className="text-[11px] font-semibold text-cb-text-muted">V1</span>
          </div>
          <div className="flex items-center h-full flex-1 min-w-0">
            {timelineClips.map((tc, i) => {
              const color = CLIP_COLORS[i % CLIP_COLORS.length];
              return (
                <div key={tc.id} className="flex items-center h-full">
                  <div
                    className="flex items-center gap-1.5 h-full rounded px-2 border"
                    style={{
                      flex: `${getClipWidth(tc.duration)} 0 0`,
                      minWidth: 60,
                      backgroundColor: `${color}22`,
                      borderColor: color,
                    }}
                  >
                    <GripVertical size={10} style={{ color }} className="shrink-0" />
                    <span className="text-[10px] font-medium text-white truncate">{tc.name}</span>
                    <span className="text-[9px] text-cb-text-muted shrink-0">{formatTimeShort(tc.duration)}</span>
                  </div>

                  {/* Transition marker */}
                  {autoTransitions && i < timelineClips.length - 1 && (
                    <div className="flex items-center justify-center w-7 h-full bg-cb-yellow shrink-0">
                      <ArrowRight size={12} className="text-cb-dark" />
                    </div>
                  )}
                </div>
              );
            })}
            {timelineClips.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-[11px] text-cb-text-muted">
                Add clips to see them here
              </div>
            )}
          </div>
        </div>

        {/* Audio Track */}
        <div className="flex items-center h-8 shrink-0">
          <div className="flex items-center gap-1 justify-center w-[60px] h-full shrink-0">
            <Music size={12} className="text-cb-text-muted" />
            <span className="text-[11px] font-semibold text-cb-text-muted">A1</span>
          </div>
          <div className="flex items-center h-full flex-1 rounded bg-cb-surface px-2 min-w-0">
            <span className="text-[10px] text-cb-text-muted truncate">
              {clips.length > 0 ? 'Audio from clips (auto-extracted)' : 'No audio'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
