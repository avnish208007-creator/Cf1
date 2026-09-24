import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { JobBanner } from './JobBanner';
import { Menu, LogOut } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface AppLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentPath,
  onNavigate,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { workspace, resetWorkspace } = useWorkspace();

  const getPageTitle = (path: string) => {
    switch (path) {
      case '/dashboard':
        return 'Workspace Dashboard';
      case '/discover':
        return 'Source Discovery';
      case '/candidates':
        return 'Candidate Moments';
      case '/clips':
        return 'Rendered Clips';
      case '/queue':
        return 'Content Queue';
      case '/settings':
        return 'Workspace Settings';
      default:
        return 'ClipFlow';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row antialiased selection:bg-zinc-800 selection:text-zinc-100">
      {/* Sidebar */}
      <Sidebar
        currentPath={currentPath}
        onNavigate={onNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top bar */}
        <header className="h-14 px-4 sm:px-6 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 md:hidden cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-zinc-100">
              {getPageTitle(currentPath)}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {workspace && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
                <span className="text-zinc-500">Niche:</span>
                <span className="font-medium text-zinc-200">{workspace.settings.niche}</span>
              </div>
            )}
            <button
              onClick={() => {
                if (window.confirm('Reset workspace and return to onboarding? All local state will be cleared.')) {
                  resetWorkspace();
                  onNavigate('/onboarding');
                }
              }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition cursor-pointer"
              title="Reset Workspace"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Global Job Banner */}
        <JobBanner />

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
