import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Minus, Plus, Magnet, Scissors, Film, Music, GripVertical, ArrowRight, StretchHorizontal, X,
} from 'lucide-react';
import useStore from '../store';

function formatTimeShort(seconds) {
  const clamped = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.floor((clamped % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

const CLIP_COLORS = ['#E8920D', '#F5C518', '#22C55E', '#EF4444', '#8B5CF6', '#06B6D4'];
const TRACK_LEFT_GUTTER = 64;
const BASE_PIXELS_PER_SECOND = 36;

export default function Timeline() {
  const {
    clips, timelineClips, zoomLevel, setZoomLevel,
    snapEnabled, toggleSnap,
    selectedTransition, autoTransitions,
    playheadPosition, setPlayheadPosition,
    splitTimelineAtPlayhead,
    moveTimelineClip, insertTimelineClipFromLibrary, removeTimelineClip,
  } = useStore();

  const scrollerRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [dropLineX, setDropLineX] = useState(null);

  const totalDuration = timelineClips.reduce((acc, c) => acc + c.duration, 0);
  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * (zoomLevel / 100);
  const minTimelineSeconds = Math.max(10, Math.ceil(totalDuration));
  const timelineWidth = Math.max(viewportWidth - TRACK_LEFT_GUTTER, minTimelineSeconds * pixelsPerSecond);
  const maxPlayableTime = totalDuration > 0 ? totalDuration : minTimelineSeconds;

  useEffect(() => {
    if (!scrollerRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportWidth(entry.contentRect.width);
    });
    observer.observe(scrollerRef.current);
    return () => observer.disconnect();
  }, []);

  const clampTime = useCallback((time) => Math.max(0, Math.min(maxPlayableTime, time)), [maxPlayableTime]);

  const clipBoundaries = useMemo(() => {
    let cursor = 0;
    const marks = [0];
    timelineClips.forEach((tc) => {
      cursor += tc.duration;
      marks.push(cursor);
    });
    return marks;
  }, [timelineClips]);

  const snapTime = useCallback((time) => {
    const clamped = clampTime(time);
    if (!snapEnabled || timelineClips.length === 0) return clamped;

    const thresholdSeconds = Math.max(0.08, 10 / pixelsPerSecond);
    const grid = zoomLevel >= 200 ? 0.1 : zoomLevel >= 125 ? 0.25 : 0.5;
    const gridSnap = Math.round(clamped / grid) * grid;

    let best = gridSnap;
    let bestDist = Math.abs(clamped - gridSnap);

    clipBoundaries.forEach((mark) => {
      const dist = Math.abs(clamped - mark);
      if (dist < bestDist) {
        best = mark;
        bestDist = dist;
      }
    });

    return bestDist <= thresholdSeconds ? clampTime(best) : clamped;
  }, [clampTime, clipBoundaries, pixelsPerSecond, snapEnabled, timelineClips.length, zoomLevel]);

  const timeFromClientX = useCallback((clientX) => {
    if (!scrollerRef.current) return 0;
    const rect = scrollerRef.current.getBoundingClientRect();
    const localX = clientX - rect.left + scrollerRef.current.scrollLeft - TRACK_LEFT_GUTTER;
    return localX / pixelsPerSecond;
  }, [pixelsPerSecond]);

  const movePlayhead = useCallback((time) => {
    setPlayheadPosition(snapTime(time));
  }, [setPlayheadPosition, snapTime]);

  const handleTrackClick = useCallback((e) => {
    movePlayhead(timeFromClientX(e.clientX));
  }, [movePlayhead, timeFromClientX]);

  const handlePlayheadPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);

    const onMove = (event) => {
      movePlayhead(timeFromClientX(event.clientX));
    };
    const onUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const fitTimeline = () => {
    if (!scrollerRef.current || totalDuration <= 0) return;
    const available = Math.max(1, scrollerRef.current.clientWidth - TRACK_LEFT_GUTTER - 16);
    const desiredZoom = (available / (totalDuration * BASE_PIXELS_PER_SECOND)) * 100;
    setZoomLevel(Math.round(desiredZoom / 5) * 5);
  };

  const handleSplit = () => {
    splitTimelineAtPlayhead(playheadPosition);
  };

  const getDropIndexFromTime = useCallback((time) => {
    if (timelineClips.length === 0) return 0;
    const t = clampTime(time);
    let cursor = 0;
    for (let i = 0; i < timelineClips.length; i++) {
      const mid = cursor + (timelineClips[i].duration / 2);
      if (t < mid) return i;
      cursor += timelineClips[i].duration;
    }
    return timelineClips.length;
  }, [clampTime, timelineClips]);

  const getBoundaryTimeAtIndex = useCallback((index) => {
    let t = 0;
    for (let i = 0; i < Math.max(0, Math.min(index, timelineClips.length)); i++) {
      t += timelineClips[i].duration;
    }
    return t;
  }, [timelineClips]);

  const updateDropGuide = useCallback((clientX, dataTransfer) => {
    if (!dataTransfer) return;
    const dragTypes = Array.from(dataTransfer.types || []);
    const supportsTimelineDrop =
      dragTypes.includes('application/x-clip-id') || dragTypes.includes('text/plain');
    if (!supportsTimelineDrop) return;

    const targetTime = timeFromClientX(clientX);
    const nextDropIndex = getDropIndexFromTime(targetTime);
    setDropIndex(nextDropIndex);
    const boundaryTime = getBoundaryTimeAtIndex(nextDropIndex);
    setDropLineX(TRACK_LEFT_GUTTER + (boundaryTime * pixelsPerSecond));
  }, [getBoundaryTimeAtIndex, getDropIndexFromTime, pixelsPerSecond, timeFromClientX]);

  const handleDragOver = (e) => {
    e.preventDefault();
    updateDropGuide(e.clientX, e.dataTransfer);
  };

  const handleDrop = (e) => {
    e.preventDefault();

    const targetTime = timeFromClientX(e.clientX);
    const insertionIndex = getDropIndexFromTime(targetTime);
    const externalClipId = e.dataTransfer.getData('application/x-clip-id');

    if (externalClipId) {
      insertTimelineClipFromLibrary(externalClipId, insertionIndex);
    } else {
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isFinite(from)) {
        const adjustedIndex = from < insertionIndex ? insertionIndex - 1 : insertionIndex;
        moveTimelineClip(from, adjustedIndex);
      }
    }

    setDraggingIndex(null);
    setDropIndex(null);
    setDropLineX(null);
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDropIndex(null);
    setDropLineX(null);
  };

  const rulerStep = useMemo(() => {
    if (pixelsPerSecond >= 100) return 0.25;
    if (pixelsPerSecond >= 70) return 0.5;
    if (pixelsPerSecond >= 45) return 1;
    return 2;
  }, [pixelsPerSecond]);

  const majorStep = rulerStep * 4;
  const rulerTicks = useMemo(() => {
    const ticks = [];
    for (let t = 0; t <= maxPlayableTime + 0.0001; t += rulerStep) {
      ticks.push(Number(t.toFixed(3)));
    }
    return ticks;
  }, [maxPlayableTime, rulerStep]);

  const playheadX = TRACK_LEFT_GUTTER + clampTime(playheadPosition) * pixelsPerSecond;
  const splitDisabled = timelineClips.length === 0 || playheadPosition <= 0 || playheadPosition >= totalDuration;

  return (
    <div className="flex flex-col bg-cb-timeline border-t border-cb-border shrink-0" style={{ height: 200 }}>
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
            <span className="text-[11px] text-cb-text-muted w-10 text-center">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(zoomLevel + 25)}
              className="w-6 h-6 rounded flex items-center justify-center bg-cb-surface-light text-cb-text-secondary hover:text-white transition-colors"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={fitTimeline}
              className="w-6 h-6 rounded flex items-center justify-center bg-cb-surface-light text-cb-text-secondary hover:text-white transition-colors"
              title="Fit timeline to viewport"
            >
              <StretchHorizontal size={12} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSnap}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              snapEnabled ? 'bg-cb-surface-light text-cb-yellow' : 'bg-cb-surface-light text-cb-text-secondary'
            }`}
          >
            <Magnet size={12} />
            Snap
          </button>
          <button
            onClick={handleSplit}
            disabled={splitDisabled}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              splitDisabled
                ? 'bg-cb-surface-light text-cb-text-muted cursor-not-allowed'
                : 'bg-cb-surface-light text-cb-text-secondary hover:text-white'
            }`}
          >
            <Scissors size={12} />
            Split
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-2">
        <div
          ref={scrollerRef}
          className="relative h-full overflow-auto"
          onClick={handleTrackClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragLeave={handleDragLeave}
        >
          <div className="relative h-full min-w-full" style={{ width: timelineWidth + TRACK_LEFT_GUTTER }}>
            <div className="sticky top-0 z-10 h-6 bg-cb-timeline border-b border-cb-border/40">
              <div className="absolute inset-y-0 left-0 w-[64px] bg-cb-timeline border-r border-cb-border/40" />
              {rulerTicks.map((t) => {
                const left = TRACK_LEFT_GUTTER + (t * pixelsPerSecond);
                const isMajor = Math.abs((t / majorStep) - Math.round(t / majorStep)) < 0.01;
                return (
                  <div key={t} className="absolute inset-y-0" style={{ left }}>
                    <div className={`w-px ${isMajor ? 'h-4 mt-1 bg-cb-border' : 'h-2 mt-3 bg-cb-border/60'}`} />
                    {isMajor && (
                      <span className="absolute -top-0.5 left-1 text-[9px] text-cb-text-muted font-inter">
                        {formatTimeShort(t)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="relative h-[80px] border-b border-cb-border/40">
              <div className="absolute inset-y-0 left-0 w-[64px] border-r border-cb-border/40 flex items-center justify-center">
                <Film size={14} className="text-cb-text-muted mr-1" />
                <span className="text-[11px] font-semibold text-cb-text-muted">V1</span>
              </div>
              {timelineClips.length > 0 ? (
                (() => {
                  let cursor = 0;
                  return timelineClips.map((tc, i) => {
                    const color = CLIP_COLORS[i % CLIP_COLORS.length];
                    const left = TRACK_LEFT_GUTTER + (cursor * pixelsPerSecond);
                    const width = Math.max(24, tc.duration * pixelsPerSecond);
                    cursor += tc.duration;
                    return (
                      <div key={tc.id}>
                        <div
                          className="absolute top-2 h-[62px] rounded border px-2 flex items-center gap-1.5 overflow-hidden"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData('text/plain', String(i));
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingIndex(i);
                          }}
                          onDragEnd={() => {
                            setDraggingIndex(null);
                            setDropIndex(null);
                            setDropLineX(null);
                          }}
                          style={{
                            left,
                            width,
                            backgroundColor: `${color}22`,
                            borderColor: color,
                            opacity: draggingIndex === i ? 0.5 : 1,
                            cursor: 'grab',
                          }}
                        >
                          <GripVertical size={10} style={{ color }} className="shrink-0" />
                          <span className="text-[10px] font-medium text-white truncate">{tc.name}</span>
                          <span className="text-[9px] text-cb-text-muted shrink-0">{formatTimeShort(tc.duration)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTimelineClip(tc.id);
                            }}
                            className="ml-auto text-cb-text-muted hover:text-cb-red transition-colors"
                            title="Remove from timeline"
                          >
                            <X size={10} />
                          </button>
                        </div>
                        {autoTransitions && i < timelineClips.length - 1 && (
                          <div
                            className="absolute top-2 h-[62px] w-3.5 bg-cb-yellow/80 border-y border-cb-yellow flex items-center justify-center"
                            style={{ left: left + width - 1 }}
                            title={`Transition: ${selectedTransition}`}
                          >
                            <ArrowRight size={10} className="text-cb-dark" />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="absolute inset-y-0 left-[64px] right-0 flex items-center justify-center text-[11px] text-cb-text-muted">
                  Drag clips here from the left panel
                </div>
              )}
            </div>

            <div className="relative h-[44px]">
              <div className="absolute inset-y-0 left-0 w-[64px] border-r border-cb-border/40 flex items-center justify-center gap-1">
                <Music size={12} className="text-cb-text-muted" />
                <span className="text-[11px] font-semibold text-cb-text-muted">A1</span>
              </div>
              <div className="absolute left-[64px] right-0 top-2 h-[28px] rounded bg-cb-surface border border-cb-border px-2 flex items-center">
                <span className="text-[10px] text-cb-text-muted truncate">
                  {clips.length > 0 ? 'Audio from clips (auto-extracted)' : 'No audio'}
                </span>
              </div>
            </div>

            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: playheadX }}>
              <div className="w-px h-full bg-cb-yellow shadow-[0_0_0_1px_rgba(245,197,24,0.2)]" />
            </div>
            {dropIndex !== null && dropLineX !== null && (
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: dropLineX }}>
                <div className="w-0.5 h-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              </div>
            )}
            <button
              onPointerDown={handlePlayheadPointerDown}
              className={`absolute top-0 -translate-x-1/2 z-20 w-3 h-3 rounded-full bg-cb-yellow border border-cb-dark ${isScrubbing ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ left: playheadX }}
              title={`Playhead ${formatTimeShort(playheadPosition)}`}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 text-[10px] text-cb-text-muted px-1">
          <span>Playhead: {formatTimeShort(playheadPosition)}</span>
          <span>{snapEnabled ? 'Snap ON' : 'Snap OFF'} - {Math.max(0, totalDuration).toFixed(2)}s total</span>
        </div>
      </div>
    </div>
  );
}
