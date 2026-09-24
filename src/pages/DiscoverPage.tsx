import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useJobs } from '../context/JobContext';
import { SourceVideo, MonitoredChannel } from '../types';
import { DiscoveryResult } from '../services/discovery/discovery.interface';
import { ApiClient } from '../services/api/client';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Compass,
  Sparkles,
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Rss,
  Radio,
  Pause,
  Play,
  Trash2,
  TrendingUp,
  Tv,
  Film,
  Layers,
} from 'lucide-react';

interface DiscoverPageProps {
  onNavigate: (path: string) => void;
}

const apiClient = new ApiClient();

export const DiscoverPage: React.FC<DiscoverPageProps> = ({ onNavigate }) => {
  const { workspace } = useWorkspace();
  const {
    sources,
    channels,
    runDiscovery,
    updateMonitoredChannelStatus,
    removeMonitoredChannel,
    analyzeSource,
    activeJob,
    refreshData,
  } = useJobs();

  const [activeTab, setActiveTab] = useState<'channels' | 'sources'>('channels');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isCheckingRss, setIsCheckingRss] = useState(false);
  const [analyzingSourceId, setAnalyzingSourceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastDiscoveryResult, setLastDiscoveryResult] = useState<DiscoveryResult | null>(null);
  const [rssCheckMessage, setRssCheckMessage] = useState<string | null>(null);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setErrorMessage(null);
    setRssCheckMessage(null);
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

  const handleQuickRssCheck = async () => {
    if (channels.length === 0) {
      setErrorMessage('No monitored channels yet. Run Discovery first to discover channels.');
      return;
    }
    setIsCheckingRss(true);
    setErrorMessage(null);
    setRssCheckMessage(null);
    try {
      const existingIds = sources.map((s) => s.externalId);
      const res = await apiClient.runScheduledRss(channels, existingIds);
      setRssCheckMessage(
        `Checked ${res.totalChecked} channels: found ${res.newSources.length} new videos (${res.duplicatesSkipped} duplicates skipped).`,
      );
      await refreshData();
    } catch (err: any) {
      setErrorMessage(err.message || 'RSS check failed.');
    } finally {
      setIsCheckingRss(false);
    }
  };

  const handleToggleChannelStatus = async (channel: MonitoredChannel) => {
    const nextStatus = channel.status === 'active' ? 'paused' : 'active';
    await updateMonitoredChannelStatus(channel.channelId, nextStatus);
  };

  const handleRemoveChannel = async (channelId: string) => {
    if (window.confirm('Stop monitoring this channel? New uploads will no longer be tracked.')) {
      await removeMonitoredChannel(channelId);
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

  const analyzedCount = sources.filter((s) => s.status === 'analyzed').length;
  const activeChannelsCount = channels.filter((c) => c.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">
              Content Discovery & Channel Monitor
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
              Invidious + RSS
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>Target Niche:</span>
            <span className="font-semibold text-zinc-200">{workspace?.settings.niche}</span>
            {workspace?.settings.subtopics && workspace.settings.subtopics.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>Angles: {workspace.settings.subtopics.join(', ')}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 font-medium">Zero Billing / No API Key</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleQuickRssCheck}
            disabled={isCheckingRss || isDiscovering || channels.length === 0}
            className="px-3 py-2 text-xs font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            title="Poll YouTube RSS feeds for new uploads on existing monitored channels"
          >
            {isCheckingRss ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking RSS...</span>
              </>
            ) : (
              <>
                <Rss className="w-3.5 h-3.5 text-amber-400" />
                <span>Check RSS Feeds</span>
              </>
            )}
          </button>

          <button
            onClick={handleDiscover}
            disabled={isDiscovering || Boolean(activeJob)}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-zinc-100 text-zinc-950 hover:bg-white transition cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isDiscovering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Discovering Channels & Uploads...</span>
              </>
            ) : (
              <>
                <Compass className="w-3.5 h-3.5 text-zinc-900" />
                <span>Run Discovery</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Discovery Pipeline Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Monitored Channels</span>
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-1">
            {channels.length}
            <span className="text-xs font-normal text-zinc-400 ml-1.5">
              ({activeChannelsCount} active)
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Discovered Videos</span>
            <Film className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{sources.length}</div>
        </div>

        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Analyzed Moments</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-300 mt-1">{analyzedCount}</div>
        </div>

        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Engine / Provider</span>
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xs font-semibold text-emerald-400 mt-1.5 truncate">
            Invidious + Atom RSS
          </div>
        </div>
      </div>

      {/* Last Discovery Run Summary */}
      {lastDiscoveryResult && (
        <div className="p-4 rounded-md bg-zinc-900/90 border border-emerald-900/40 text-xs text-zinc-300 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-zinc-100">
                Discovery Complete ({lastDiscoveryResult.providerName})
              </span>
            </div>
            {lastDiscoveryResult.queryAnglesUsed && lastDiscoveryResult.queryAnglesUsed.length > 0 && (
              <div className="text-[11px] text-zinc-400 font-mono truncate">
                Angles: {lastDiscoveryResult.queryAnglesUsed.join(' · ')}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-zinc-800/60 text-[11px]">
            <div>
              <span className="text-zinc-500">Channels Discovered:</span>{' '}
              <strong className="text-zinc-200">{lastDiscoveryResult.channelsDiscovered || 0}</strong>
            </div>
            <div>
              <span className="text-zinc-500">Channels Added:</span>{' '}
              <strong className="text-emerald-300">+{lastDiscoveryResult.channelsAdded || 0}</strong>
            </div>
            <div>
              <span className="text-zinc-500">New Videos:</span>{' '}
              <strong className="text-emerald-300">+{lastDiscoveryResult.newVideos || lastDiscoveryResult.sources.length}</strong>
            </div>
            <div>
              <span className="text-zinc-500">Duplicates Skipped:</span>{' '}
              <strong className="text-zinc-400">{lastDiscoveryResult.duplicatesSkipped || 0}</strong>
            </div>
          </div>
        </div>
      )}

      {rssCheckMessage && (
        <div className="p-3.5 rounded-md bg-amber-950/40 border border-amber-900/60 text-xs text-amber-200 flex items-center gap-2.5">
          <Rss className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{rssCheckMessage}</span>
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

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
        <button
          onClick={() => setActiveTab('channels')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'channels'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>Monitored Channels ({channels.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sources')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'sources'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Discovered Videos ({sources.length})</span>
        </button>
      </div>

      {/* TAB 1: Monitored Channels View */}
      {activeTab === 'channels' && (
        <>
          {channels.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No channels monitored yet"
              description={`Click "Run Discovery" to automatically search for top YouTube channels in the "${workspace?.settings.niche}" niche and register them for RSS upload monitoring.`}
              actionLabel="Run Discovery"
              onAction={handleDiscover}
              secondaryActionLabel="Workspace Settings"
              onSecondaryAction={() => onNavigate('/settings')}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>
                  {channels.length} Monitored Channel{channels.length === 1 ? '' : 's'}
                </span>
                <span>Automatic RSS monitoring · No quota limits</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {channels.map((ch) => (
                  <div
                    key={ch.channelId}
                    className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/80 flex flex-col justify-between gap-3 hover:border-zinc-700 transition"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-full bg-zinc-950 border border-zinc-800 shrink-0 overflow-hidden flex items-center justify-center">
                        {ch.thumbnailUrl ? (
                          <img
                            src={ch.thumbnailUrl}
                            alt={ch.channelName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Tv className="w-5 h-5 text-zinc-500" />
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-zinc-100 truncate">
                            {ch.channelName}
                          </h4>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              ch.relevanceScore >= 80
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {ch.relevanceScore}% Relevance
                          </span>
                        </div>

                        {ch.matchedQueries && ch.matchedQueries.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {ch.matchedQueries.map((q) => (
                              <span
                                key={q}
                                className="px-1.5 py-0.2 rounded text-[9px] bg-zinc-800 text-zinc-400 font-mono"
                              >
                                {q}
                              </span>
                            ))}
                          </div>
                        )}

                        {ch.latestVideoTitle && (
                          <p className="text-[11px] text-zinc-400 line-clamp-1 pt-1">
                            <span className="text-zinc-500">Latest:</span> {ch.latestVideoTitle}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-400">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            ch.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                        />
                        <span className="capitalize">{ch.status}</span>
                        {ch.lastSuccessfulCheckAt && (
                          <span className="text-zinc-500 hidden sm:inline">
                            · Last RSS: {new Date(ch.lastSuccessfulCheckAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {ch.channelUrl && (
                          <a
                            href={ch.channelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                            title="Open Channel on YouTube"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleToggleChannelStatus(ch)}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition flex items-center gap-1 cursor-pointer"
                        >
                          {ch.status === 'active' ? (
                            <>
                              <Pause className="w-3 h-3 text-amber-400" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 text-emerald-400" />
                              <span>Resume</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveChannel(ch.channelId)}
                          className="p-1.5 rounded hover:bg-rose-950/60 text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                          title="Remove Channel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: Discovered Video Sources View */}
      {activeTab === 'sources' && (
        <>
          {sources.length === 0 ? (
            <EmptyState
              icon={Film}
              title="No video uploads discovered yet"
              description="Click 'Run Discovery' to discover channels and ingest their recent YouTube video uploads via public RSS feeds."
              actionLabel="Run Discovery"
              onAction={handleDiscover}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>
                  {sources.length} Discovered Video Upload{sources.length === 1 ? '' : 's'}
                </span>
                <span>Metadata ingested via YouTube Atom RSS</span>
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
                          {source.duration > 0 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-300">
                              {Math.floor(source.duration / 60)}:
                              {(Math.floor(source.duration) % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                            <span className="text-zinc-300 font-medium">{source.channelTitle}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-emerald-400 font-semibold">
                              {source.rankScore || source.relevanceScore}% Rank
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{new Date(source.publishedAt).toLocaleDateString()}</span>
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
                            title="Open Source Video URL"
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
        </>
      )}
    </div>
  );
};
