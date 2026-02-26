import {
  Sparkles, LayoutGrid, Circle, Coins, Settings, ChevronDown,
} from 'lucide-react';
import useStore from '../store';

export default function TopBar() {
  const { activeNav, setActiveNav } = useStore();

  const navItems = [
    { id: 'new-project', label: 'New Project', icon: Sparkles, primary: true },
    { id: 'gallery', label: 'Gallery', icon: LayoutGrid },
    { id: 'my-projects', label: 'My Projects', icon: Circle },
  ];

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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  item.primary
                    ? 'bg-cb-yellow text-cb-dark font-semibold'
                    : isActive
                    ? 'bg-cb-surface-light text-white'
                    : 'text-cb-text-secondary hover:text-white hover:bg-cb-surface-light'
                }`}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Nav */}
      <div className="flex items-center gap-3">
        {/* Credits Badge */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-cb-border">
          <Coins size={14} className="text-cb-yellow" />
          <span className="text-xs font-medium text-cb-text-secondary">UNLIMITED credits</span>
        </div>

        {/* PRO Badge */}
        <div className="px-2.5 py-1 rounded border border-cb-yellow">
          <span className="text-[11px] font-bold text-cb-yellow">PRO</span>
        </div>

        {/* Settings */}
        <button className="text-cb-text-secondary hover:text-white transition-colors">
          <Settings size={20} />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-cb-orange flex items-center justify-center">
          <span className="text-sm font-semibold text-white">A</span>
        </div>
      </div>
    </header>
  );
}
