import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import useStore from '../store';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CenterArea() {
  const {
    clips, selectedClipId, isPlaying, setIsPlaying,
    currentTime, setCurrentTime, volume, setVolume,
  } = useStore();

  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const previewContainerRef = useRef(null);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const totalDuration = clips.reduce((acc, c) => acc + c.duration, 0);

  // Find the currently active clip based on selectedClipId or first clip
  const activeClip = clips.find((c) => c.id === selectedClipId) || clips[0];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
  }, [volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;

    if (video.src !== activeClip.url) {
      video.src = activeClip.url;
      video.load();
    }
  }, [activeClip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(currentTime)) return;
    if (Math.abs(video.currentTime - currentTime) > 0.25) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, activeClip, setIsPlaying]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  };

  const handleProgressClick = (e) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    video.currentTime = percent * video.duration;
    setCurrentTime(video.currentTime);
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  const toggleFullscreen = async () => {
    const container = previewContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await container.requestFullscreen();
  };

  const videoDuration = videoRef.current?.duration || activeClip?.duration || 0;
  const progressPercent = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  return (
    <main className="flex flex-col gap-5 p-6 flex-1 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-grotesk text-lg font-semibold text-white">Preview</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-cb-text-muted">
            Total: {formatTime(totalDuration)}
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
        {activeClip ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              playsInline
            />

            {/* Play Overlay (center) */}
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

            {/* Player Controls (bottom) */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-3 bg-black/50 backdrop-blur-sm">
              <button onClick={togglePlay} className="text-white hover:text-cb-yellow transition-colors">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <span className="text-xs font-medium text-cb-text-secondary w-10 text-center">
                {formatTime(currentTime)}
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
                  style={{ left: `${progressPercent}%`, transform: `translate(-50%, -50%)` }}
                />
              </div>

              <span className="text-xs font-medium text-cb-text-secondary w-10 text-center">
                {formatTime(videoDuration)}
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
