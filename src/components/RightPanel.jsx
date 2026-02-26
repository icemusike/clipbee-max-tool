import {
  ArrowRight, Blend, MoveHorizontal, Sparkles, ChevronDown, Download, X, Play,
} from 'lucide-react';
import useStore from '../store';
import { useState } from 'react';

const TRANSITIONS = [
  { id: 'fade', label: 'Fade', icon: ArrowRight },
  { id: 'dissolve', label: 'Dissolve', icon: Blend },
  { id: 'slide', label: 'Slide', icon: MoveHorizontal },
];

const FORMATS = ['MP4', 'MOV', 'WEBM', 'AVI'];
const QUALITIES = ['4K', '1080p', '720p', '480p'];
const FPS_OPTIONS = [24, 30, 60];
const RENDER_API_BASE = (import.meta.env.VITE_RENDER_API_URL || '').replace(/\/$/, '');

function SelectDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cb-input border border-cb-border text-xs font-medium text-white hover:border-cb-text-muted transition-colors"
      >
        {value}
        <ChevronDown size={12} className="text-cb-text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-cb-surface border border-cb-border rounded-md shadow-xl py-1 min-w-[80px]">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${String(opt) === String(value)
                    ? 'text-cb-yellow bg-cb-input'
                    : 'text-cb-text-secondary hover:text-white hover:bg-cb-input'
                  }`}
              >
                {typeof opt === 'number' ? `${opt} fps` : opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function RightPanel() {
  const {
    selectedTransition, setSelectedTransition,
    transitionDuration, setTransitionDuration,
    autoTransitions, toggleAutoTransitions,
    outputFormat, setOutputFormat,
    outputQuality, setOutputQuality,
    outputFps, setOutputFps,
    isRendering, setIsRendering, setRenderProgress,
    clips,
    timelineClips,
  } = useStore();

  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFilename, setPreviewFilename] = useState(null);
  const [renderError, setRenderError] = useState(null);

  const handleRender = async () => {
    if (clips.length === 0 || timelineClips.length === 0) return;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderError(null);
    setPreviewUrl(null);

    try {
      const isVercelHosted = typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app');
      if (isVercelHosted && !RENDER_API_BASE) {
        throw new Error('Render is disabled on this Vercel deployment. Vercel functions reject large video uploads (FUNCTION_PAYLOAD_TOO_LARGE). Set VITE_RENDER_API_URL to a dedicated render backend.');
      }

      const clipById = new Map(clips.map((clip) => [clip.id, clip]));
      const renderSegments = timelineClips
        .map((segment) => ({
          segment,
          clip: clipById.get(segment.clipId),
        }))
        .filter((item) => Boolean(item.clip?.file));

      if (renderSegments.length === 0) {
        throw new Error('No renderable clips. Please add video files before rendering.');
      }

      // Upload clips to server
      const formData = new FormData();
      const segmentsPayload = [];
      renderSegments.forEach(({ clip, segment }) => {
        formData.append('clips', clip.file);
        segmentsPayload.push({
          start: Math.max(0, Number(segment.sourceStart || 0)),
          end: Math.max(0, Number(segment.sourceEnd || segment.duration || 0)),
        });
      });
      formData.append('segments', JSON.stringify(segmentsPayload));
      formData.append('transition', selectedTransition);
      formData.append('transitionDuration', transitionDuration);
      formData.append('format', outputFormat.toLowerCase());
      formData.append('quality', outputQuality);
      formData.append('fps', outputFps);

      const response = await fetch(`${RENDER_API_BASE}/api/render`, {
        method: 'POST',
        body: formData,
      });

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `Render failed (${response.status})` };
      }

      if (response.ok && data.url) {
        const resolvedUrl = /^https?:\/\//i.test(data.url) ? data.url : `${RENDER_API_BASE}${data.url}`;
        setPreviewUrl(resolvedUrl);
        setPreviewFilename(data.filename);
      } else {
        setRenderError(data.error || `Render failed (${response.status})`);
      }
    } catch (e) {
      setRenderError(e.message);
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = previewFilename || `clipbee-output.${outputFormat.toLowerCase()}`;
    a.click();
  };

  return (
    <aside className="w-[280px] flex flex-col gap-5 p-5 bg-cb-surface border-l border-cb-border shrink-0 overflow-y-auto">
      {/* Preview / Result */}
      {previewUrl && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-grotesk text-base font-semibold text-white flex items-center gap-1.5">
              <Play size={16} className="text-cb-yellow" />
              Preview
            </h3>
            <button
              onClick={() => setPreviewUrl(null)}
              className="text-cb-text-muted hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="rounded-lg overflow-hidden border border-cb-border bg-black">
            <video
              src={previewUrl}
              controls
              autoPlay
              className="w-full aspect-video"
            />
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-all active:scale-[0.98]"
          >
            <Download size={16} />
            Download Video
          </button>
          <div className="h-px bg-cb-border" />
        </div>
      )}

      {/* Render Error */}
      {renderError && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-400">Render Failed</span>
            <button onClick={() => setRenderError(null)} className="text-cb-text-muted hover:text-white">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-red-300 bg-red-500/10 px-3 py-2 rounded-md border border-red-500/20">
            {renderError}
          </p>
          <div className="h-px bg-cb-border" />
        </div>
      )}

      {/* Transitions */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-grotesk text-base font-semibold text-white">Transitions</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-cb-text-muted">Auto</span>
            <button
              onClick={toggleAutoTransitions}
              className={`w-8 h-[18px] rounded-full flex items-center transition-colors p-0.5 ${autoTransitions ? 'bg-cb-yellow justify-end' : 'bg-cb-input justify-start'
                }`}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-white" />
            </button>
          </div>
        </div>

        {/* Transition Grid */}
        <div className="flex gap-2">
          {TRANSITIONS.map((t) => {
            const Icon = t.icon;
            const isActive = selectedTransition === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTransition(t.id)}
                className={`flex flex-col items-center justify-center gap-1 h-16 flex-1 rounded-md transition-all ${isActive
                    ? 'bg-cb-yellow text-cb-dark'
                    : 'bg-cb-input border border-cb-border text-cb-text-secondary hover:border-cb-text-muted'
                  }`}
              >
                <Icon size={18} />
                <span className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Duration */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-cb-text-secondary">Transition Duration</span>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={transitionDuration}
              onChange={(e) => setTransitionDuration(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs font-medium text-cb-yellow min-w-[30px] text-right">
              {transitionDuration.toFixed(1)}s
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-cb-border" />

      {/* Output Settings */}
      <div className="flex flex-col gap-3">
        <h3 className="font-grotesk text-base font-semibold text-white">Output Settings</h3>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-cb-text-secondary">Format</span>
          <SelectDropdown value={outputFormat.toUpperCase()} options={FORMATS} onChange={(v) => setOutputFormat(v)} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-cb-text-secondary">Quality</span>
          <SelectDropdown value={outputQuality} options={QUALITIES} onChange={setOutputQuality} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] text-cb-text-secondary">Frame Rate</span>
          <SelectDropdown
            value={`${outputFps} fps`}
            options={FPS_OPTIONS}
            onChange={(v) => setOutputFps(typeof v === 'number' ? v : parseInt(v))}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-cb-border" />

      {/* Render Button */}
      <button
        onClick={handleRender}
        disabled={isRendering || clips.length === 0 || timelineClips.length === 0}
        className={`flex items-center justify-center gap-2 h-11 rounded-lg font-grotesk text-sm font-semibold transition-all ${isRendering
            ? 'bg-cb-yellow/60 text-cb-dark cursor-wait'
            : clips.length === 0 || timelineClips.length === 0
              ? 'bg-cb-surface-light text-cb-text-muted cursor-not-allowed'
              : 'bg-cb-yellow text-cb-dark hover:brightness-110 active:scale-[0.98]'
          }`}
      >
        <Sparkles size={18} />
        {isRendering ? 'Rendering...' : 'Render Final Video'}
        {!isRendering && (
          <span className="text-[10px] font-semibold bg-black/10 px-2 py-0.5 rounded">
            20 credits
          </span>
        )}
      </button>
    </aside>
  );
}
