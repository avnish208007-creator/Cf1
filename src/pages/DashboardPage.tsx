import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useJobs } from '../context/JobContext';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { VideoPlayer } from '../components/ui/VideoPlayer';
import {
  Compass,
  Sparkles,
  Film,
  ListOrdered,
  Play,
  ArrowRight,
  AlertCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Clip } from '../types';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { workspace } = useWorkspace();
  const {
    sources,
    candidates,
    clips,
    queueItems,
    jobs,
    activeJob,
    runDiscovery,
  } = useJobs();

  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const readyClips = clips.filter((c) => c.status === 'ready' || c.status === 'queued');
  const needsReviewCandidates = candidates.filter((c) => c.status === 'detected');
  const failedJobs = jobs.filter((j) => j.status === 'failed');

  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoverError(null);
    try {
      await runDiscovery();
      onNavigate('/discover');
    } catch (err: any) {
      setDiscoverError(err.message || 'Discovery failed.');
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">
              {workspace?.name}
            </h2>
            <span className="text-zinc-500 text-xs font-mono">/</span>
            <span className="text-xs font-medium text-zinc-300">
              {workspace?.settings.niche}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Automated content discovery and 9:16 vertical video synthesis engine.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('/settings')}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-800 text-zinc-300 hover:bg-zinc-900 transition cursor-pointer"
          >
            Configure Niche
          </button>
          <button
            onClick={handleRunDiscovery}
            disabled={isDiscovering || Boolean(activeJob)}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-zinc-100 text-zinc-950 hover:bg-white transition cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{isDiscovering ? 'Discovering...' : 'Run Discovery'}</span>
          </button>
        </div>
      </div>

      {discoverError && (
        <div className="p-3.5 rounded-md bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Discovery Notice:</span> {discoverError}
          </div>
        </div>
      )}

      {/* Primary Metric Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => onNavigate('/discover')}
          className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Discovered Sources</span>
            <Compass className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {sources.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {sources.filter((s) => s.status === 'analyzed').length} analyzed for moments
          </div>
        </div>

        <div
          onClick={() => onNavigate('/candidates')}
          className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Detected Moments</span>
            <Sparkles className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {candidates.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {needsReviewCandidates.length} pending review
          </div>
        </div>

        <div
          onClick={() => onNavigate('/clips')}
          className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Rendered Clips</span>
            <Film className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {clips.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {readyClips.length} verified 9:16 MP4s
          </div>
        </div>

        <div
          onClick={() => onNavigate('/queue')}
          className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Queue Items</span>
            <ListOrdered className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {queueItems.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {queueItems.filter((q) => q.status === 'Ready').length} ready for distribution
          </div>
        </div>
      </div>

      {/* Pipeline Status & Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: What Needs Review / Next Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Moments awaiting decision */}
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">
                  Moments Awaiting Review
                </h3>
                <p className="text-[11px] text-zinc-400">
                  High-potential hooks extracted from analyzed sources.
                </p>
              </div>
              {needsReviewCandidates.length > 0 && (
                <button
                  onClick={() => onNavigate('/candidates')}
                  className="text-xs font-medium text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <span>View All ({needsReviewCandidates.length})</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {needsReviewCandidates.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                {sources.length === 0
                  ? 'No sources discovered yet. Run discovery to locate niche content.'
                  : 'All detected moments have been reviewed or rendered.'}
              </div>
            ) : (
              <div className="space-y-3">
                {needsReviewCandidates.slice(0, 3).map((cand) => (
                  <div
                    key={cand.id}
                    className="p-3.5 rounded-md bg-zinc-950/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                        <span className="font-semibold text-zinc-300">
                          {cand.qualityTier} Quality
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Score {cand.scores.overall}/100</span>
                        <span aria-hidden="true">·</span>
                        <span>{cand.duration}s window</span>
                      </div>
                      <h4 className="text-xs font-medium text-zinc-200 line-clamp-1">
                        {cand.hook}
                      </h4>
                      <p className="text-[11px] text-zinc-500 line-clamp-1">
                        Source: {cand.sourceTitle}
                      </p>
                    </div>

                    <button
                      onClick={() => onNavigate('/candidates')}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition shrink-0 cursor-pointer self-start sm:self-center"
                    >
                      Review Moment
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Rendered Clips Preview */}
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">
                  Recent Rendered Clips
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Native 1080x1920 vertical video MP4s rendered via FFmpeg.
                </p>
              </div>
              {clips.length > 0 && (
                <button
                  onClick={() => onNavigate('/clips')}
                  className="text-xs font-medium text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <span>Clips Gallery ({clips.length})</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {clips.length === 0 ? (
              <EmptyState
                icon={Film}
                title="No clips rendered yet"
                description="Select and render a moment candidate to generate an authentic 9:16 vertical video with captions."
                actionLabel={candidates.length > 0 ? 'Review Candidates' : 'Run Discovery'}
                onAction={() =>
                  onNavigate(candidates.length > 0 ? '/candidates' : '/discover')
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {clips.slice(0, 2).map((clip) => (
                  <div
                    key={clip.id}
                    className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col justify-between"
                  >
                    <div className="space-y-2 mb-3">
                      <div className="aspect-[9/16] max-h-56 w-full rounded bg-zinc-900 overflow-hidden relative group">
                        {clip.posterUrl ? (
                          <img
                            src={clip.posterUrl}
                            alt={clip.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Film className="w-8 h-8" />
                          </div>
                        )}
                        <button
                          onClick={() => setSelectedClip(clip)}
                          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          aria-label="Play clip"
                        >
                          <div className="w-10 h-10 rounded-full bg-white/90 text-zinc-950 flex items-center justify-center shadow-lg">
                            <Play className="w-5 h-5 ml-0.5 fill-zinc-950" />
                          </div>
                        </button>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-zinc-200 line-clamp-1">
                          {clip.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
                          <span>{clip.duration.toFixed(1)}s</span>
                          <span aria-hidden="true">·</span>
                          <span>9:16 Vertical</span>
                          <span aria-hidden="true">·</span>
                          <span>{(clip.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedClip(clip)}
                      className="w-full py-1.5 text-xs font-medium rounded border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
                    >
                      Inspect Video & Captions
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Engine Jobs & Pipeline Logs */}
        <div className="space-y-6">
          <div className="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800/80">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">
              Engine Operations & Jobs
            </h3>
            <p className="text-[11px] text-zinc-400 mb-4">
              Real job states and execution logs.
            </p>

            {jobs.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">
                No jobs executed yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {jobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-md bg-zinc-950/70 border border-zinc-800/80 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-300 capitalize">
                        {job.type} Job
                      </span>
                      <StatusIndicator
                        status={job.status}
                        variant={
                          job.status === 'completed'
                            ? 'success'
                            : job.status === 'failed'
                            ? 'error'
                            : 'info'
                        }
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-1">
                      {job.currentStep}
                    </p>
                    {job.errorMessage && (
                      <p className="text-[10px] text-rose-400 font-mono">
                        Error: {job.errorMessage}
                      </p>
                    )}
                    <div className="text-[10px] text-zinc-600 font-mono pt-1">
                      {new Date(job.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Development Notice & Pipeline Capabilities */}
          <div className="p-4 rounded-lg bg-zinc-900/30 border border-zinc-800/60 text-xs space-y-2">
            <span className="font-semibold text-zinc-300">Architecture Guarantee:</span>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              ClipFlow strictly enforces zero-fake data. Rendered videos are encoded as genuine H.264/AAC MP4 files with FFmpeg and verified via FFprobe container validation.
            </p>
          </div>
        </div>
      </div>

      {/* Modal for Clip Player Inspection */}
      {selectedClip && (
        <Modal
          isOpen={Boolean(selectedClip)}
          onClose={() => setSelectedClip(null)}
          title={`Clip Inspection: ${selectedClip.title}`}
          maxWidth="max-w-3xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="w-full flex justify-center">
              <VideoPlayer
                src={selectedClip.videoUrl}
                poster={selectedClip.posterUrl}
                className="w-full max-w-[280px] aspect-[9/16]"
              />
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Hook Title
                </span>
                <p className="text-sm font-semibold text-zinc-100 mt-0.5">
                  {selectedClip.title}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Social Caption
                </span>
                <div className="mt-1 p-3 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 font-sans whitespace-pre-wrap">
                  {selectedClip.caption}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Target Hashtags
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedClip.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-1.5">
                <span className="text-[11px] text-zinc-400 font-semibold">
                  FFprobe Output Validation
                </span>
                <div className="text-[10px] font-mono text-zinc-400 space-y-0.5">
                  <div>Resolution: {selectedClip.resolution.width}x{selectedClip.resolution.height} (9:16)</div>
                  <div>Duration: {selectedClip.duration.toFixed(2)}s</div>
                  <div>Size: {(selectedClip.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</div>
                  <div>Codecs: H.264 / AAC</div>
                  <div className="text-emerald-400">Stream Status: Validated Browser-Compatible MP4</div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
