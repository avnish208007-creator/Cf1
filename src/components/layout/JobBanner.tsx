import React from 'react';
import { useJobs } from '../../context/JobContext';
import { Loader2, AlertCircle, CheckCircle2, X, RefreshCw } from 'lucide-react';

export const JobBanner: React.FC = () => {
  const { activeJob, jobs, dismissJob, retryJob } = useJobs();

  // Find latest failed, timed_out, interrupted or active job
  const displayedJob =
    activeJob ||
    jobs.find(
      (j) =>
        j.status === 'failed' ||
        j.status === ('timed_out' as any) ||
        j.status === ('interrupted' as any) ||
        j.currentStep?.toLowerCase().includes('timed out') ||
        j.currentStep?.toLowerCase().includes('interrupted'),
    );

  if (!displayedJob) return null;

  const isError =
    displayedJob.status === 'failed' ||
    displayedJob.status === ('timed_out' as any) ||
    displayedJob.status === ('interrupted' as any) ||
    displayedJob.currentStep?.toLowerCase().includes('timed out') ||
    displayedJob.currentStep?.toLowerCase().includes('interrupted');

  const isCompleted = displayedJob.status === 'completed';

  return (
    <div
      className={`px-4 py-3 border-b text-xs flex items-center justify-between transition-all ${
        isError
          ? 'bg-rose-950/40 border-rose-900/60 text-rose-200'
          : isCompleted
          ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-200'
          : 'bg-zinc-900/90 border-zinc-800 text-zinc-300'
      }`}
    >
      <div className="flex items-center gap-2.5 max-w-[80%]">
        {isError ? (
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
        ) : isCompleted ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0" />
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 truncate">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-zinc-400">
            {displayedJob.type} · {displayedJob.status.replace('_', ' ')}
          </span>
          <span className="hidden sm:inline text-zinc-600">|</span>
          <span className="truncate">{displayedJob.currentStep}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {displayedJob.errorCode && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900/50 text-rose-300 hidden sm:inline">
            {displayedJob.errorCode}
          </span>
        )}

        {isError && (
          <button
            onClick={() => retryJob(displayedJob.id)}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-900/60 hover:bg-rose-800/80 text-rose-100 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Job</span>
          </button>
        )}

        <button
          onClick={() => dismissJob(displayedJob.id)}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition cursor-pointer"
          title="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
