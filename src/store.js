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
        id: clip.id,
        clipId: clip.id,
        name: clip.name.replace(/\.[^/.]+$/, ''),
        duration: clip.duration,
        color: clip.color,
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
      const timelineClips = [...state.timelineClips];
      const [movedTc] = timelineClips.splice(fromIndex, 1);
      timelineClips.splice(toIndex, 0, movedTc);
      return { clips, timelineClips };
    }),

  selectClip: (id) => set({ selectedClipId: id }),

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
}));

export default useStore;
