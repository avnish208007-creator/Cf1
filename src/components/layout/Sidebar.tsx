import React from 'react';
import {
  LayoutDashboard,
  Compass,
  Sparkles,
  Film,
  ListOrdered,
  Settings,
  Flame,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useJobs } from '../../context/JobContext';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  isOpen,
  onClose,
}) => {
  const { workspace } = useWorkspace();
  const { sources, candidates, clips, queueItems } = useJobs();

  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      count: undefined,
    },
    {
      name: 'Discover',
      path: '/discover',
      icon: Compass,
      count: sources.length > 0 ? sources.length : undefined,
    },
    {
      name: 'Candidates',
      path: '/candidates',
      icon: Sparkles,
      count: candidates.length > 0 ? candidates.length : undefined,
    },
    {
      name: 'Clips',
      path: '/clips',
      icon: Film,
      count: clips.length > 0 ? clips.length : undefined,
    },
    {
      name: 'Queue',
      path: '/queue',
      icon: ListOrdered,
      count: queueItems.length > 0 ? queueItems.length : undefined,
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: Settings,
      count: undefined,
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-zinc-100 flex items-center justify-center text-zinc-950 font-bold text-sm tracking-tighter">
              <Flame className="w-4 h-4 fill-zinc-950" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-zinc-100">
                ClipFlow
              </span>
              <span className="text-[10px] text-zinc-500 font-mono ml-1.5">v1.0</span>
            </div>
          </div>
        </div>

        {/* Active Workspace / Niche summary card */}
        {workspace && (
          <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/30">
            <div className="text-[11px] font-medium text-zinc-400 truncate">
              {workspace.name}
            </div>
            <div className="text-xs font-semibold text-zinc-200 mt-0.5 truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="truncate">{workspace.settings.niche}</span>
            </div>
          </div>
        )}

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;

            return (
              <button
                key={item.path}
                onClick={() => {
                  onNavigate(item.path);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`} />
                  <span>{item.name}</span>
                </div>
                {item.count !== undefined && (
                  <span className="text-[11px] font-mono text-zinc-500">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-zinc-800/80 text-[11px] text-zinc-500 space-y-1">
          <div className="flex items-center justify-between">
            <span>Database</span>
            <span className="font-mono text-emerald-400">Firebase Firestore</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Rendering</span>
            <span className="font-mono text-emerald-400">FFmpeg 1080x1920</span>
          </div>
        </div>
      </aside>
    </>
  );
};
