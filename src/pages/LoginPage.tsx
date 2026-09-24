import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Flame, ArrowRight, ShieldCheck } from 'lucide-react';

interface LoginPageProps {
  onNavigate: (path: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { workspace } = useWorkspace();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 selection:bg-zinc-800">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800/80 rounded-lg p-6 sm:p-8 space-y-6 shadow-2xl text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-zinc-100 text-zinc-950 mx-auto shadow-md">
          <Flame className="w-7 h-7 fill-zinc-950" />
        </div>

        <div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-100">
            Welcome to ClipFlow
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Automated niche discovery & 9:16 vertical video clipping engine.
          </p>
        </div>

        <div className="p-3 rounded bg-zinc-950 border border-zinc-800/80 text-[11px] text-zinc-400 text-left space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-zinc-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Firebase Firestore & Auth Active</span>
          </div>
          <p className="text-zinc-500 leading-relaxed">
            Persistence is synchronized to Google Cloud Firestore with zero-trust security rules and instant local cache reliability.
          </p>
        </div>

        <div className="space-y-2">
          {workspace ? (
            <button
              onClick={() => onNavigate('/dashboard')}
              className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
            >
              <span>Continue to {workspace.name}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => onNavigate('/onboarding')}
              className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
            >
              <span>Set Up Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {workspace && (
            <button
              onClick={() => onNavigate('/onboarding')}
              className="w-full py-2 px-4 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs font-medium rounded-md transition cursor-pointer"
            >
              Create New Workspace
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
