import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useJobs } from '../context/JobContext';
import { EmptyState } from '../components/ui/EmptyState';
import { SourceVideo } from '../types';
import { DiscoveryResult } from '../services/discovery/discovery.interface';
import {
  Compass,
  Sparkles,
  ExternalLink,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  RotateCcw,
  Tag,
  Flame,
  ShieldCheck,
  Search,
} from 'lucide-react';

interface DiscoverPageProps {
  onNavigate: (path: string) => void;
}

export const DiscoverPage: React.FC<DiscoverPageProps> = ({ onNavigate }) => {
  const { workspace } = useWorkspace();
  const { sources, runDiscovery, analyzeSource, activeJob } = useJobs();

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [analyzingSourceId, setAnalyzingSourceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastDiscoveryResult, setLastDiscoveryResult] = useState<DiscoveryResult | null>(null);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setErrorMessage(null);
    try {
      const res = await runDiscovery();
      if (res) {
        setLastDiscoveryResult(res);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Discovery operation failed.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAnalyze = async (source: SourceVideo) => {
    setAnalyzingSourceId(source.id);
    setErrorMessage(null);
    try {
      await analyzeSource(source);
      onNavigate('/candidates');
    } catch (err: any) {
      setErrorMessage(err.message || 'Analysis failed.');
    } finally {
      setAnalyzingSourceId(null);
    }
  };

  const isConfigured = Boolean(
    workspace?.settings.enableDevAuthorizedSource ||
      (workspace?.settings.youtubeApiKey && workspace.settings.youtubeApiKey.length > 10),
  );

  const analyzedCount = sources.filter((s) => s.status === 'analyzed').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Source Content Discovery
          </h2>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>Target Niche:</span>
            <span className="font-semibold text-zinc-200">
              {workspace?.settings.niche}
            </span>
            {workspace?.settings.subtopics && workspace.settings.subtopics.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>Angles: {workspace.settings.subtopics.join(', ')}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDiscover}
            disabled={isDiscovering || Boolean(activeJob)}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-zinc-100 text-zinc-950 hover:bg-white transition cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isDiscovering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Scanning Discovery Angles...</span>
              </>
            ) : (
              <>
                <Compass className="w-3.5 h-3.5" />
                <span>Run Discovery</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Discovery Pipeline Metrics */}
      {sources.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[11px] font-medium text-zinc-400">Total Sources in DB</span>
            <div className="text-xl font-bold text-zinc-100 mt-1">{sources.length}</div>
          </div>
          <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[11px] font-medium text-zinc-400">Analyzed for Moments</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">{analyzedCount}</div>
          </div>
          <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[11px] font-medium text-zinc-400">Primary Provider</span>
            <div className="text-sm font-semibold text-zinc-200 mt-1 truncate">
              {workspace?.settings.youtubeApiKey ? 'YouTube Data API v3' : 'Development Media'}
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[11px] font-medium text-zinc-400">Persistence Store</span>
            <div className="text-sm font-semibold text-emerald-400 mt-1">Cloud Firestore</div>
          </div>
        </div>
      )}

      {/* Last Discovery Run Summary */}
      {lastDiscoveryResult && (
        <div className="p-3.5 rounded-md bg-zinc-900/80 border border-zinc-700/80 text-xs text-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Last Scan: Found {lastDiscoveryResult.totalDiscovered} items (
              <strong className="text-zinc-100">{lastDiscoveryResult.totalAccepted}</strong> accepted
              {lastDiscoveryResult.totalRejected > 0 && `, ${lastDiscoveryResult.totalRejected} rejected by metadata validation`}
              ) via {lastDiscoveryResult.providerName}
            </span>
          </div>
          {lastDiscoveryResult.queryAnglesUsed && lastDiscoveryResult.queryAnglesUsed.length > 0 && (
            <div className="text-[11px] text-zinc-400 font-mono truncate max-w-sm">
              Angles: {lastDiscoveryResult.queryAnglesUsed.slice(0, 2).join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* Provider Connectivity Banner */}
      {!isConfigured && (
        <div className="p-4 rounded-md bg-amber-950/40 border border-amber-900/60 text-xs text-amber-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Discovery Provider Not Connected</span>
              <p className="text-amber-300/80 text-[11px] mt-0.5 leading-relaxed">
                ClipFlow requires a genuine discovery source provider. In Workspace Settings, configure your YouTube Data API v3 key or enable the isolated DEVELOPMENT ONLY Authorized Media provider to run the automated pipeline.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('/settings')}
            className="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-xs font-medium shrink-0 cursor-pointer transition"
          >
            Settings
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-md bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold">Discovery Notice</span>
              <p className="text-[11px] leading-relaxed">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={handleDiscover}
            disabled={isDiscovering}
            className="px-3 py-1.5 rounded bg-rose-900/50 hover:bg-rose-900/80 text-rose-200 text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Discovered Sources List */}
      {sources.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No sources discovered yet"
          description={`Click "Run Discovery" to automatically scan the "${workspace?.settings.niche}" niche across specified angles, or configure your API key in Settings.`}
          actionLabel="Run Discovery"
          onAction={handleDiscover}
          secondaryActionLabel="Open Settings"
          onSecondaryAction={() => onNavigate('/settings')}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>
              {sources.length} Discovered Source{sources.length === 1 ? '' : 's'}
            </span>
            <span>Sorted by Multi-Factor Rank & Niche Relevance</span>
          </div>

          <div className="space-y-3">
            {sources.map((source) => {
              const isAnalyzing = analyzingSourceId === source.id;
              const isAnalyzed = source.status === 'analyzed';

              return (
                <div
                  key={source.id}
                  className="p-4 sm:p-5 rounded-lg bg-zinc-900/50 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-5 transition hover:border-zinc-700"
                >
                  {/* Thumbnail & Source Info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-28 h-20 sm:w-36 sm:h-24 rounded bg-zinc-950 border border-zinc-800 shrink-0 overflow-hidden relative">
                      {source.thumbnailUrl ? (
                        <img
                          src={source.thumbnailUrl}
                          alt={source.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Compass className="w-6 h-6" />
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-300">
                        {Math.floor(source.duration / 60)}:
                        {(Math.floor(source.duration) % 60).toString().padStart(2, '0')}
                      </span>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                        <span className="text-zinc-300 font-medium">{source.channelTitle}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {source.rankScore || source.relevanceScore}% Rank
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{source.platform.replace('_', ' ')}</span>
                        {source.discoveryQuery && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-zinc-500 font-mono text-[10px] truncate max-w-[200px]">
                              Query: "{source.discoveryQuery}"
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-zinc-100 line-clamp-2 leading-snug">
                        {source.title}
                      </h3>

                      <p className="text-xs text-zinc-400 line-clamp-1">
                        {source.relevanceReason}
                      </p>

                      {source.analysis && (
                        <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 border-t border-zinc-800/60 mt-2">
                          <span className="text-zinc-300 font-medium bg-zinc-800/80 px-2 py-0.5 rounded text-[10px]">
                            {source.analysis.topicCategory}
                          </span>
                          <span>Topic Clarity: {source.analysis.topicClarity}%</span>
                          <span aria-hidden="true">·</span>
                          <span>Hook Potential: {source.analysis.hookPotentialScore || source.analysis.shortFormPotentialScore}%</span>
                          <span aria-hidden="true">·</span>
                          <span>{source.analysis.potentialHooksCount} detected triggers</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                    {source.url.startsWith('http') && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition"
                        title="Open Source URL"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    {isAnalyzed ? (
                      <button
                        onClick={() => onNavigate('/candidates')}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>View Moments</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAnalyze(source)}
                        disabled={isAnalyzing || Boolean(activeJob)}
                        className="px-4 py-2 text-xs font-semibold rounded-md bg-zinc-100 text-zinc-950 hover:bg-white transition cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Analyze Moments</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

