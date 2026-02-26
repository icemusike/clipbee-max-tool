import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Play, Pause, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import useStore from '../store';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CenterArea() {
  const {
    clips, timelineClips, selectedClipId,
    isPlaying, setIsPlaying,
    currentTime, setCurrentTime,
    playheadPosition, setPlayheadPosition,
    volume, setVolume,
    clearClipPreviewUrl, refreshClipPreviewUrl,
  } = useStore();

  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const previewContainerRef = useRef(null);
  const blobRetryRef = useRef(new Set());

  // Segment tracking refs
  const segIndexRef = useRef(0);
  const currentSourceRef = useRef('');
  const loadIdRef = useRef(0);
  const suppressTimeUpdateRef = useRef(false);
  const prevSeqKeyRef = useRef('');

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Build ordered playback sequence from timeline + source clips
  const timelineSequence = useMemo(() => {
    const clipMap = new Map(clips.map((c) => [c.id, c]));
    let absoluteStart = 0;
    return timelineClips
      .map((tc) => {
        const sourceClip = clipMap.get(tc.clipId);
        const entry = {
          id: tc.id,
          clipId: tc.clipId,
          url: sourceClip?.url || '',
          sourceStart: tc.sourceStart || 0,
          sourceEnd: tc.sourceEnd || tc.duration,
          duration: tc.duration,
          absoluteStart,
          absoluteEnd: absoluteStart + tc.duration,
        };
        absoluteStart += tc.duration;
        return entry;
      })
      .filter((e) => e.url);
  }, [clips, timelineClips]);

  const totalDuration = useMemo(
    () => timelineSequence.reduce((sum, s) => sum + s.duration, 0),
    [timelineSequence],
  );

  const hasTimeline = timelineSequence.length > 0;

  // Fallback: no timeline clips — show selected clip from library (old behavior)
  const fallbackClip = useMemo(() => {
    if (hasTimeline) return null;
    const playable = clips.filter((c) => typeof c.url === 'string' && c.url.length > 0);
    return playable.find((c) => c.id === selectedClipId) || playable[0] || null;
  }, [hasTimeline, clips, selectedClipId]);

  // Find which segment and local time corresponds to an absolute timeline position
  const getSegmentAtTime = useCallback(
    (absTime) => {
      if (timelineSequence.length === 0) return null;
      const t = Math.max(0, Math.min(absTime, totalDuration));
      for (let i = 0; i < timelineSequence.length; i++) {
        const seg = timelineSequence[i];
        if (t < seg.absoluteEnd - 0.001 || i === timelineSequence.length - 1) {
          const localTime = seg.sourceStart + (t - seg.absoluteStart);
          return { index: i, segment: seg, localTime: Math.min(localTime, seg.sourceEnd) };
        }
      }
      return null;
    },
    [timelineSequence, totalDuration],
  );

  // Load a specific segment into the video element, optionally auto-playing
  const loadSegment = useCallback(
    (index, seekToLocal, autoPlay = false) => {
      const video = videoRef.current;
      if (!video || !timelineSequence[index]) return;

      const seg = timelineSequence[index];
      segIndexRef.current = index;
      const thisLoadId = ++loadIdRef.current;

      const needsSwitch = currentSourceRef.current !== seg.url;

      if (needsSwitch) {
        currentSourceRef.current = seg.url;
        suppressTimeUpdateRef.current = true;
        video.src = seg.url;

        const onLoaded = () => {
          if (loadIdRef.current !== thisLoadId) return; // stale load
          video.currentTime = seekToLocal ?? seg.sourceStart;
          suppressTimeUpdateRef.current = false;
          if (autoPlay) video.play().catch(() => {});
        };
        video.addEventListener('loadeddata', onLoaded, { once: true });
      } else {
        video.currentTime = seekToLocal ?? seg.sourceStart;
        if (autoPlay) video.play().catch(() => {});
      }
    },
    [timelineSequence],
  );

  // --- Effects ---

  // Volume sync
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = volume;
  }, [volume]);

  // Detect timeline sequence changes (reorder/add/remove) and reload preview
  useEffect(() => {
    const seqKey = timelineSequence.map((s) => `${s.id}:${s.url}`).join('|');
    if (seqKey === prevSeqKeyRef.current) return;
    prevSeqKeyRef.current = seqKey;

    if (timelineSequence.length === 0) return;
    const video = videoRef.current;
    if (!video) return;

    // Pause if playing
    if (useStore.getState().isPlaying) {
      video.pause();
      useStore.getState().setIsPlaying(false);
    }

    // Reload at clamped playhead position
    const pos = Math.max(0, Math.min(useStore.getState().playheadPosition, totalDuration));
    const info = getSegmentAtTime(pos);
    if (info) {
      loadSegment(info.index, info.localTime);
    }
  }, [timelineSequence, totalDuration, getSegmentAtTime, loadSegment]);

  // Sync preview to external playhead changes (timeline scrubbing) when NOT playing
  useEffect(() => {
    if (isPlaying || !hasTimeline) return;
    const info = getSegmentAtTime(playheadPosition);
    if (info) {
      loadSegment(info.index, info.localTime);
      setCurrentTime(playheadPosition);
    }
  }, [playheadPosition]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ intentionally minimal deps: only re-run when playheadPosition changes externally

  // Fallback clip mode (no timeline)
  useEffect(() => {
    if (hasTimeline || !fallbackClip) return;
    const video = videoRef.current;
    if (!video) return;
    currentSourceRef.current = fallbackClip.url;
    if (video.src !== fallbackClip.url) {
      video.src = fallbackClip.url;
      video.load();
    }
  }, [hasTimeline, fallbackClip]);

  // Fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // --- Handlers ---

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!hasTimeline && !fallbackClip) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      // If at end of timeline, restart
      if (hasTimeline && playheadPosition >= totalDuration - 0.05 && timelineSequence.length > 0) {
        loadSegment(0, timelineSequence[0].sourceStart, true);
        setCurrentTime(0);
        setPlayheadPosition(0);
        setIsPlaying(true);
        return;
      }
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, hasTimeline, fallbackClip, playheadPosition, totalDuration, timelineSequence, loadSegment, setIsPlaying, setCurrentTime, setPlayheadPosition]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || suppressTimeUpdateRef.current) return;

    // Fallback: single clip mode
    if (!hasTimeline) {
      setCurrentTime(video.currentTime);
      return;
    }

    const segIndex = segIndexRef.current;
    const seg = timelineSequence[segIndex];
    if (!seg) return;

    const localProgress = video.currentTime - seg.sourceStart;
    const absoluteTime = Math.min(seg.absoluteStart + Math.max(0, localProgress), totalDuration);
    setCurrentTime(absoluteTime);
    setPlayheadPosition(absoluteTime);

    // Check if we've reached the end of this segment
    if (video.currentTime >= seg.sourceEnd - 0.05) {
      const nextIndex = segIndex + 1;
      if (nextIndex < timelineSequence.length) {
        const nextSeg = timelineSequence[nextIndex];
        // Optimization: same source, just keep playing (or seek within)
        if (nextSeg.url === seg.url && Math.abs(video.currentTime - nextSeg.sourceStart) < 0.1) {
          segIndexRef.current = nextIndex;
        } else {
          loadSegment(nextIndex, nextSeg.sourceStart, true);
        }
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }
  }, [hasTimeline, timelineSequence, totalDuration, loadSegment, setIsPlaying, setCurrentTime, setPlayheadPosition]);

  const handleVideoEnded = useCallback(() => {
    if (!hasTimeline) {
      setIsPlaying(false);
      return;
    }
    // Advance to next segment
    const nextIndex = segIndexRef.current + 1;
    if (nextIndex < timelineSequence.length) {
      loadSegment(nextIndex, timelineSequence[nextIndex].sourceStart, true);
    } else {
      setIsPlaying(false);
    }
  }, [hasTimeline, timelineSequence, loadSegment, setIsPlaying]);

  const handleProgressClick = useCallback(
    (e) => {
      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect) return;
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      if (hasTimeline) {
        const seekTime = percent * totalDuration;
        const info = getSegmentAtTime(seekTime);
        if (info) {
          loadSegment(info.index, info.localTime, isPlaying);
          setCurrentTime(seekTime);
          setPlayheadPosition(seekTime);
        }
      } else {
        const video = videoRef.current;
        if (video && video.duration) {
          video.currentTime = percent * video.duration;
          setCurrentTime(video.currentTime);
        }
      }
    },
    [hasTimeline, totalDuration, getSegmentAtTime, loadSegment, isPlaying, setCurrentTime, setPlayheadPosition],
  );

  const handleVideoError = useCallback(() => {
    // Attempt blob URL refresh
    if (hasTimeline) {
      const seg = timelineSequence[segIndexRef.current];
      if (seg && !blobRetryRef.current.has(seg.clipId)) {
        const refreshed = refreshClipPreviewUrl(seg.clipId);
        if (refreshed) {
          blobRetryRef.current.add(seg.clipId);
          return;
        }
      }
    } else if (fallbackClip?.id && fallbackClip.url?.startsWith('blob:') && !blobRetryRef.current.has(fallbackClip.id)) {
      const refreshed = refreshClipPreviewUrl(fallbackClip.id);
      if (refreshed) {
        blobRetryRef.current.add(fallbackClip.id);
        return;
      }
      clearClipPreviewUrl(fallbackClip.id);
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    currentSourceRef.current = '';
    setIsPlaying(false);
    setCurrentTime(0);
  }, [hasTimeline, timelineSequence, fallbackClip, refreshClipPreviewUrl, clearClipPreviewUrl, setIsPlaying, setCurrentTime]);

  const toggleFullscreen = async () => {
    const container = previewContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen();
    }
  };

  // Display values
  const displayDuration = hasTimeline ? totalDuration : (videoRef.current?.duration || fallbackClip?.duration || 0);
  const displayTime = currentTime;
  const progressPercent = displayDuration > 0 ? Math.min(100, (displayTime / displayDuration) * 100) : 0;
  const hasContent = hasTimeline || fallbackClip;

  return (
    <main className="flex flex-col gap-5 p-6 flex-1 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-grotesk text-lg font-semibold text-white">Preview</h2>
        <div className="flex items-center gap-2">
          {hasTimeline && (
            <span className="text-[11px] text-cb-yellow font-medium px-1.5 py-0.5 rounded bg-cb-yellow/10">
              Timeline
            </span>
          )}
          <span className="text-xs text-cb-text-muted">
            {formatTime(displayDuration)}
          </span>
          <button
            onClick={toggleFullscreen}
            className="text-cb-text-secondary hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      {/* Preview Player */}
      <div ref={previewContainerRef} className="relative flex-1 rounded-[10px] overflow-hidden bg-cb-dark flex items-center justify-center min-h-0">
        {hasContent ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
              playsInline
            />

            {/* Play Overlay */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                  <Play size={24} className="text-white ml-1" />
                </div>
              </button>
            )}

            {/* Player Controls */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-3 bg-black/50 backdrop-blur-sm">
              <button onClick={togglePlay} className="text-white hover:text-cb-yellow transition-colors">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <span className="text-xs font-medium text-cb-text-secondary w-10 text-center">
                {formatTime(displayTime)}
              </span>

              {/* Progress Bar */}
              <div
                ref={progressRef}
                className="flex-1 h-1 rounded-full bg-cb-surface-light cursor-pointer relative group"
                onClick={handleProgressClick}
              >
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-cb-yellow transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cb-yellow opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${progressPercent}%`, transform: 'translate(-50%, -50%)' }}
                />
              </div>

              <span className="text-xs font-medium text-cb-text-secondary w-10 text-center">
                {formatTime(displayDuration)}
              </span>

              {/* Volume */}
              <div className="relative" onMouseLeave={() => setShowVolumeSlider(false)}>
                <button
                  onClick={() => setVolume(volume > 0 ? 0 : 1)}
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  className="text-white hover:text-cb-yellow transition-colors"
                >
                  {volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                {showVolumeSlider && (
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-cb-surface rounded-lg p-2 shadow-xl">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-20 accent-cb-yellow"
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 text-cb-text-muted">
            <Play size={48} className="opacity-30" />
            <span className="text-sm">Add clips to preview</span>
          </div>
        )}
      </div>
    </main>
  );
}
