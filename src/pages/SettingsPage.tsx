import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ContentStyle, CaptionStyle } from '../types';
import { ApiClient } from '../services/api/client';
import {
  Save,
  Plus,
  X,
  AlertTriangle,
  Check,
  Trash2,
  Key,
  Info,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface SettingsPageProps {
  onNavigate: (path: string) => void;
}

const apiClient = new ApiClient();

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { workspace, updateSettings, resetWorkspace } = useWorkspace();

  const [niche, setNiche] = useState('');
  const [subtopics, setSubtopics] = useState<string[]>([]);
  const [newSubtopic, setNewSubtopic] = useState('');
  const [language, setLanguage] = useState('en');
  const [contentStyle, setContentStyle] = useState<ContentStyle>('breakdown');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('bold_punchy');
  const [brandAccent, setBrandAccent] = useState('#3b82f6');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitlesUppercase, setSubtitlesUppercase] = useState(true);
  const [enableDevAuthorizedSource, setEnableDevAuthorizedSource] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Server-side discovery status & connection test state
  const [discoveryStatus, setDiscoveryStatus] = useState<{
    configured: boolean;
    provider: string;
    status: 'connected' | 'not_configured';
  } | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    status: string;
    errorCode?: string;
    message: string;
  } | null>(null);

  const fetchDiscoveryStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await apiClient.getDiscoveryStatus();
      setDiscoveryStatus(res);
    } catch (err) {
      console.warn('[SettingsPage] Failed to fetch discovery status:', err);
      setDiscoveryStatus({
        configured: false,
        provider: 'YouTube Data API v3',
        status: 'not_configured',
      });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const result = await apiClient.testDiscoveryConnection();
      setConnectionTestResult(result);
      if (result.success) {
        setDiscoveryStatus({
          configured: true,
          provider: 'YouTube Data API v3',
          status: 'connected',
        });
      }
    } catch (err: any) {
      setConnectionTestResult({
        success: false,
        status: 'Network error',
        errorCode: 'DISCOVERY_REQUEST_FAILED',
        message: err.message || 'Connection test failed.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  useEffect(() => {
    fetchDiscoveryStatus();
  }, []);

  useEffect(() => {
    if (workspace) {
      setNiche(workspace.settings.niche || '');
      setSubtopics(workspace.settings.subtopics || []);
      setLanguage(workspace.settings.language || 'en');
      setContentStyle(workspace.settings.contentStyle || 'breakdown');
      setCaptionStyle(workspace.settings.captionStyle || 'bold_punchy');
      setBrandAccent(workspace.settings.brandAccent || '#3b82f6');
      setSubtitlesEnabled(workspace.settings.subtitlePreferences?.enabled ?? true);
      setSubtitlesUppercase(workspace.settings.subtitlePreferences?.uppercase ?? true);
      setEnableDevAuthorizedSource(workspace.settings.enableDevAuthorizedSource ?? true);
    }
  }, [workspace]);

  const handleAddSubtopic = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newSubtopic.trim();
    if (!clean) return;
    if (!subtopics.includes(clean)) {
      setSubtopics([...subtopics, clean]);
    }
    setNewSubtopic('');
  };

  const handleRemoveSubtopic = (topic: string) => {
    setSubtopics(subtopics.filter((t) => t !== topic));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await updateSettings({
        niche: niche.trim(),
        subtopics,
        language,
        contentStyle,
        captionStyle,
        brandAccent,
        subtitlePreferences: {
          enabled: subtitlesEnabled,
          uppercase: subtitlesUppercase,
          maxWordsPerLine: 4,
          position: 'bottom',
          fontSize: 24,
        },
        enableDevAuthorizedSource,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      window.confirm(
        'WARNING: This will clear all workspace configuration, discovered sources, candidate moments, clips, and internal queue items. Proceed?',
      )
    ) {
      await resetWorkspace();
      onNavigate('/onboarding');
    }
  };

  // Derive badge state
  const isKeyConfigured = discoveryStatus?.configured ?? false;
  const isInvalid = connectionTestResult && !connectionTestResult.success && connectionTestResult.errorCode === 'DISCOVERY_API_KEY_INVALID';
  const isQuotaExceeded = connectionTestResult && !connectionTestResult.success && connectionTestResult.errorCode === 'DISCOVERY_QUOTA_EXCEEDED';

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Workspace Configuration
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Configure niche focus, dynamic styling, and verified provider connectivity.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-xs font-semibold rounded-md bg-zinc-100 text-zinc-950 hover:bg-white transition cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              <span>Saving...</span>
            </>
          ) : saveSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Saved Successfully</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save Workspace Settings</span>
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Core Discovery Parameters */}
        <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">Niche & Query Angles</h3>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">
              Primary Content Niche <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. AI Technology, Fitness & Nutrition, SaaS Growth"
              className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">
              Subtopic Query Angles
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtopic}
                onChange={(e) => setNewSubtopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubtopic())}
                placeholder="e.g. Neural Networks, Calisthenics, Cold Email"
                className="flex-1 px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => handleAddSubtopic()}
                className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1 cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-2">
              {subtopics.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800/80 text-zinc-200 text-xs border border-zinc-700/60"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => handleRemoveSubtopic(t)}
                    className="hover:text-rose-400 transition cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Content Style & Formatting */}
        <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">Output Curation Rules</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Target Content Style</label>
              <select
                value={contentStyle}
                onChange={(e) => setContentStyle(e.target.value as ContentStyle)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500 cursor-pointer"
              >
                <option value="breakdown">Technical Breakdown & Tutorial</option>
                <option value="storytelling">Narrative & Case Study</option>
                <option value="commentary">Analytical Commentary</option>
                <option value="educational">Foundational Educational</option>
                <option value="interview">Interview & Discussion Highlight</option>
                <option value="action">High-Paced Action & Demonstration</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Subtitle Layout Style</label>
              <select
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value as CaptionStyle)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500 cursor-pointer"
              >
                <option value="bold_punchy">Bold High-Contrast Words (Bottom)</option>
                <option value="clean_subtle">Clean Centered Subtitle Box</option>
                <option value="minimal">Minimal Single-Line Transcript</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800/60">
            <label className="text-xs font-medium text-zinc-300">Brand Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandAccent}
                onChange={(e) => setBrandAccent(e.target.value)}
                className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer p-0.5"
              />
              <span className="text-xs font-mono text-zinc-400 uppercase">{brandAccent}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Subtitle Burning Pipeline */}
        <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Subtitle Burning Pipeline</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Dynamic ASS/SRT caption burning directly into 1080x1920 vertical video.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-md bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-zinc-200">
                  Burn Subtitles into Video Output
                </span>
                <p className="text-[11px] text-zinc-400">
                  Embeds clip-relative timed cues with outline and safe margin constraints.
                </p>
              </div>
              <input
                type="checkbox"
                checked={subtitlesEnabled}
                onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 cursor-pointer"
              />
            </div>

            {subtitlesEnabled && (
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                <span className="text-xs text-zinc-400">Uppercase Formatting</span>
                <input
                  type="checkbox"
                  checked={subtitlesUppercase}
                  onChange={(e) => setSubtitlesUppercase(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        {/* Discovery & Media Providers (Production YouTube API is Server-Side Secret Only) */}
        <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">
                Discovery & Media Providers
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                ClipFlow never fabricates dummy results, scrapes YouTube, or creates fake video files.
              </p>
            </div>
          </div>

          {/* Server-Side YouTube Data API Provider Status */}
          <div className="p-4 rounded-md bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-200">
                  YouTube Data API v3 (Production Discovery)
                </span>
              </div>

              {/* Status Badge */}
              {isLoadingStatus ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Checking...</span>
                </div>
              ) : isQuotaExceeded ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-800/60">
                  <XCircle className="w-3 h-3 text-rose-400" />
                  <span>QUOTA_EXCEEDED</span>
                </div>
              ) : isInvalid ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-800/60">
                  <XCircle className="w-3 h-3 text-rose-400" />
                  <span>INVALID</span>
                </div>
              ) : isKeyConfigured ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span>CONNECTED</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>NOT_CONFIGURED</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded bg-zinc-900/70 border border-zinc-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-300 text-xs font-medium">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>Zero-Trust Server Secret Architecture</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                ClipFlow uses the YouTube Data API only for metadata and discovery. The API key is stored as a server-side secret (<code className="text-zinc-300 font-mono">YOUTUBE_API_KEY</code>) and is never stored in workspace data, sent to the browser, or committed to source control.
              </p>
              <p className="text-[11px] text-zinc-500">
                To configure: Open <strong>Google AI Studio</strong> → <strong>Settings</strong> → <strong>Secrets</strong> and add <code className="text-zinc-400 font-mono">YOUTUBE_API_KEY</code>.
              </p>
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="px-3.5 py-1.5 text-xs font-semibold rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                {isTestingConnection ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Testing Connection...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Test YouTube Connection</span>
                  </>
                )}
              </button>

              {connectionTestResult && (
                <div
                  className={`text-xs px-3 py-1.5 rounded border flex items-center gap-2 ${
                    connectionTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}
                >
                  {connectionTestResult.success ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold">{connectionTestResult.status}:</span>
                  <span className="truncate">{connectionTestResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Development Media Provider Toggle */}
          <div className="p-4 rounded-md bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-start justify-between">
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-400">
                    [DEVELOPMENT ONLY] Authorized Local Media Provider
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Permits local end-to-end testing using our verified, authorized Creative Commons moving media sample. Exercises the real 1080x1920 FFmpeg rendering and FFprobe validation pipeline directly without requiring third-party API credentials. Strictly isolated from production discovery.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enableDevAuthorizedSource}
                onChange={(e) => setEnableDevAuthorizedSource(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 cursor-pointer shrink-0 mt-1"
              />
            </div>
          </div>
        </div>

        {/* Danger Zone: Storage Reset */}
        <div className="p-6 rounded-lg bg-rose-950/20 border border-rose-900/50 space-y-3">
          <div className="flex items-center gap-2 text-rose-300">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="text-sm font-semibold">Workspace Data & Persistence</h3>
          </div>
          <p className="text-xs text-rose-200/80 leading-relaxed">
            All workspace metadata, sources, candidate moments, clips, and internal queue items are persisted to Firebase Cloud Firestore and synchronized locally with instant offline cache.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-1.5 rounded bg-rose-900/50 hover:bg-rose-900/80 text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Workspace Data & Re-onboard</span>
          </button>
        </div>
      </form>
    </div>
  );
};
