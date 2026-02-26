import { useCallback, useRef } from 'react';
import {
  Upload, FolderOpen, GripVertical, Trash2, Film,
} from 'lucide-react';
import useStore from '../store';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function SortableClip({ clip, isSelected, onSelect, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: clip.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(clip.id)}
      className={`flex items-center gap-2.5 p-2.5 rounded-lg bg-cb-input cursor-pointer transition-all ${
        isSelected ? 'ring-1 ring-cb-yellow' : 'hover:ring-1 hover:ring-cb-border'
      }`}
    >
      <button {...attributes} {...listeners} className="text-cb-text-muted cursor-grab active:cursor-grabbing">
        <GripVertical size={16} />
      </button>

      <div className="w-14 h-9 rounded overflow-hidden bg-cb-surface-light flex-shrink-0">
        {clip.thumbnail ? (
          <img src={clip.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={16} className="text-cb-text-muted" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[13px] font-medium text-white truncate">{clip.name}</span>
        <span className="text-[11px] text-cb-text-muted">
          {formatDuration(clip.duration)} - {formatSize(clip.size)}
        </span>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(clip.id); }}
        className="text-cb-text-muted hover:text-cb-red transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function LeftPanel() {
  const { clips, selectedClipId, addClip, removeClip, selectClip, reorderClips } = useStore();
  const fileInputRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = clips.findIndex((c) => c.id === active.id);
      const newIndex = clips.findIndex((c) => c.id === over.id);
      reorderClips(oldIndex, newIndex);
    }
  };

  const processFile = useCallback(async (file) => {
    if (!file.type.startsWith('video/')) return;

    const metadata = await new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        // Capture thumbnail
        video.currentTime = Math.min(1, video.duration / 4);
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, 160, 90);
          resolve({
            duration: video.duration,
            thumbnail: canvas.toDataURL('image/jpeg', 0.7),
          });
          URL.revokeObjectURL(video.src);
        };
      };
      video.onerror = () => resolve({ duration: 0, thumbnail: null });
      video.src = URL.createObjectURL(file);
    });

    addClip(file, metadata);
  }, [addClip]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files || []);
    files.forEach(processFile);
  }, [processFile]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(processFile);
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <aside className="w-[380px] flex flex-col gap-4 p-5 bg-cb-surface border-r border-cb-border shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-grotesk text-lg font-semibold text-white">Video Clips</h2>
        <span className="text-[11px] font-semibold text-cb-dark bg-cb-yellow px-2.5 py-0.5 rounded-full">
          {clips.length} clip{clips.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleFileDrop}
        onDragOver={handleDragOver}
        className="flex flex-col items-center justify-center gap-2 h-[120px] rounded-lg border-2 border-dashed border-cb-yellow bg-transparent cursor-pointer hover:bg-cb-yellow/5 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={28} className="text-cb-yellow" />
        <span className="text-sm font-medium text-cb-text-secondary">Drag & Drop Video Clips Here</span>
        <span className="text-[11px] text-cb-text-muted">MP4, MOV, WEBM - Max 500MB each</span>
        <button
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-cb-surface-light border border-cb-border text-xs font-medium text-white hover:bg-cb-border transition-colors"
        >
          <FolderOpen size={14} className="text-cb-yellow" />
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Clip List */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={clips.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {clips.map((clip) => (
              <SortableClip
                key={clip.id}
                clip={clip}
                isSelected={selectedClipId === clip.id}
                onSelect={selectClip}
                onRemove={removeClip}
              />
            ))}
          </SortableContext>
        </DndContext>

        {clips.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-cb-text-muted text-sm gap-2">
            <Film size={32} className="opacity-40" />
            <span>No clips added yet</span>
          </div>
        )}
      </div>
    </aside>
  );
}
