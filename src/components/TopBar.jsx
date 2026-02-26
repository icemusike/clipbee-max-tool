import {
  Sparkles,
} from 'lucide-react';
import useStore from '../store';
import { getClientSessionId } from '../utils/session';

export default function TopBar() {
  const { setActiveNav, resetProject } = useStore();

  const handleNewProject = async () => {
    setActiveNav('new-project');
    resetProject();
    localStorage.removeItem('clipbee-project-last');

    try {
      await fetch('/api/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getClientSessionId(),
        },
      });
    } catch {
      // Keep local reset behavior even if server cleanup request fails.
    }
  };

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-cb-surface border-b border-cb-border shrink-0">
      {/* Left Nav */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center">
          <span className="font-grotesk text-2xl font-extrabold text-white">Clip</span>
          <span
            className="font-grotesk text-[32px] font-black italic"
            style={{
              background: 'linear-gradient(180deg, #F5A623 0%, #FBCB18 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            B
          </span>
          <span
            className="font-grotesk text-2xl font-extrabold"
            style={{
              background: 'linear-gradient(90deg, #F5A623 0%, #FBCB18 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ee
          </span>
          <span className="w-1.5" />
          <span className="font-grotesk text-sm font-medium text-cb-text-secondary">MaxVid</span>
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-cb-border" />

        {/* Nav Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewProject}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold bg-cb-yellow text-cb-dark"
          >
            <Sparkles size={14} />
            New Project
          </button>
        </div>
      </div>

      {/* Right Nav */}
      <div className="flex items-center gap-3">
        {/* PRO Badge */}
        <div className="px-2.5 py-1 rounded border border-cb-yellow">
          <span className="text-[11px] font-bold text-cb-yellow">PRO</span>
        </div>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-cb-orange flex items-center justify-center">
          <span className="text-sm font-semibold text-white">A</span>
        </div>
      </div>
    </header>
  );
}
