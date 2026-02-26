import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

const useStore = create((set, get) => ({
  // Clips
  clips: [],
  selectedClipId: null,

  addClip: (file, metadata) => {
    const clip = {
      id: uuidv4(),
      file,
      name: file.name,
      size: file.size,
      duration: metadata?.duration || 0,
      thumbnail: metadata?.thumbnail || null,
      url: URL.createObjectURL(file),
      color: ['#E8920D', '#F5C518', '#22C55E', '#EF4444'][get().clips.length % 4],
    };
    set((state) => ({
      clips: [...state.clips, clip],
      timelineClips: [...state.timelineClips, {
        id: uuidv4(),
        clipId: clip.id,
        name: clip.name.replace(/\.[^/.]+$/, ''),
        duration: clip.duration,
        color: clip.color,
        sourceStart: 0,
        sourceEnd: clip.duration,
      }],
    }));
    return clip;
  },

  removeClip: (id) =>
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== id),
      timelineClips: state.timelineClips.filter((c) => c.clipId !== id),
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
    })),

  reorderClips: (fromIndex, toIndex) =>
    set((state) => {
      const clips = [...state.clips];
      const [moved] = clips.splice(fromIndex, 1);
      clips.splice(toIndex, 0, moved);

      // Keep timeline segments grouped by clip while preserving intra-clip split order.
      const timelineByClipId = state.timelineClips.reduce((acc, tc) => {
        if (!acc[tc.clipId]) acc[tc.clipId] = [];
        acc[tc.clipId].push(tc);
        return acc;
      }, {});
      const timelineClips = clips.flatMap((c) => timelineByClipId[c.id] || []);
      return { clips, timelineClips };
    }),

  selectClip: (id) => set({ selectedClipId: id }),

  splitTimelineAtPlayhead: (positionSeconds) =>
    set((state) => {
      const splitPos = Number(positionSeconds);
      if (!Number.isFinite(splitPos) || splitPos <= 0 || state.timelineClips.length === 0) {
        return {};
      }

      let cursor = 0;
      let splitIndex = -1;
      for (let i = 0; i < state.timelineClips.length; i++) {
        const tc = state.timelineClips[i];
        const end = cursor + tc.duration;
        if (splitPos > cursor + 0.05 && splitPos < end - 0.05) {
          splitIndex = i;
          break;
        }
        cursor = end;
      }

      if (splitIndex === -1) return {};

      const target = state.timelineClips[splitIndex];
      const firstDuration = splitPos - cursor;
      const secondDuration = target.duration - firstDuration;
      if (firstDuration <= 0.05 || secondDuration <= 0.05) return {};

      const splitSourceTime = (target.sourceStart || 0) + firstDuration;
      const leftSegment = {
        ...target,
        id: uuidv4(),
        duration: firstDuration,
        sourceStart: target.sourceStart || 0,
        sourceEnd: splitSourceTime,
      };
      const rightSegment = {
        ...target,
        id: uuidv4(),
        duration: secondDuration,
        sourceStart: splitSourceTime,
        sourceEnd: target.sourceEnd ?? splitSourceTime + secondDuration,
      };

      const timelineClips = [...state.timelineClips];
      timelineClips.splice(splitIndex, 1, leftSegment, rightSegment);
      return { timelineClips };
    }),

  // Timeline
  timelineClips: [],
  playheadPosition: 0,
  isPlaying: false,
  zoomLevel: 100,
  snapEnabled: true,
  currentTime: 0,

  setPlayheadPosition: (pos) => set({ playheadPosition: pos }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setZoomLevel: (level) => set({ zoomLevel: Math.max(25, Math.min(400, level)) }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setCurrentTime: (time) => set({ currentTime: time }),

  getTotalDuration: () => {
    const state = get();
    return state.timelineClips.reduce((acc, c) => acc + c.duration, 0);
  },

  // Transitions
  selectedTransition: 'fade',
  transitionDuration: 0.5,
  autoTransitions: true,

  setSelectedTransition: (t) => set({ selectedTransition: t }),
  setTransitionDuration: (d) => set({ transitionDuration: d }),
  toggleAutoTransitions: () => set((state) => ({ autoTransitions: !state.autoTransitions })),

  // Output settings
  outputFormat: 'mp4',
  outputQuality: '1080p',
  outputFps: 30,

  setOutputFormat: (f) => set({ outputFormat: f }),
  setOutputQuality: (q) => set({ outputQuality: q }),
  setOutputFps: (fps) => set({ outputFps: fps }),

  // Render state
  isRendering: false,
  renderProgress: 0,

  setIsRendering: (r) => set({ isRendering: r }),
  setRenderProgress: (p) => set({ renderProgress: p }),

  // Preview
  previewUrl: null,
  volume: 1,
  setVolume: (v) => set({ volume: v }),

  // Navigation
  activeNav: 'new-project',
  setActiveNav: (nav) => set({ activeNav: nav }),

  saveProject: () => {
    const state = get();
    const payload = {
      timestamp: Date.now(),
      clips: state.clips.map((c) => ({
        id: c.id,
        name: c.name,
        size: c.size,
        duration: c.duration,
        thumbnail: c.thumbnail,
        color: c.color,
      })),
      timelineClips: state.timelineClips,
      settings: {
        selectedTransition: state.selectedTransition,
        transitionDuration: state.transitionDuration,
        autoTransitions: state.autoTransitions,
        outputFormat: state.outputFormat,
        outputQuality: state.outputQuality,
        outputFps: state.outputFps,
      },
    };
    localStorage.setItem('clipbee-project-last', JSON.stringify(payload));
    return payload;
  },

  loadProject: () => {
    const raw = localStorage.getItem('clipbee-project-last');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.clips)) return false;

      set((state) => {
        state.clips.forEach((clip) => {
          try { URL.revokeObjectURL(clip.url); } catch { /* no-op */ }
        });
        return {
          clips: parsed.clips.map((c) => ({ ...c, file: null, url: '' })),
          timelineClips: Array.isArray(parsed.timelineClips) ? parsed.timelineClips : [],
          selectedTransition: parsed.settings?.selectedTransition || state.selectedTransition,
          transitionDuration: parsed.settings?.transitionDuration ?? state.transitionDuration,
          autoTransitions: parsed.settings?.autoTransitions ?? state.autoTransitions,
          outputFormat: parsed.settings?.outputFormat || state.outputFormat,
          outputQuality: parsed.settings?.outputQuality || state.outputQuality,
          outputFps: parsed.settings?.outputFps || state.outputFps,
          selectedClipId: null,
          isPlaying: false,
          currentTime: 0,
          playheadPosition: 0,
        };
      });
      return true;
    } catch {
      return false;
    }
  },

  resetProject: () =>
    set((state) => {
      state.clips.forEach((clip) => {
        try { URL.revokeObjectURL(clip.url); } catch { /* no-op */ }
      });
      return {
        clips: [],
        timelineClips: [],
        selectedClipId: null,
        isPlaying: false,
        currentTime: 0,
        playheadPosition: 0,
      };
    }),
}));

export default useStore;
