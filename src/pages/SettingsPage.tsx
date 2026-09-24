import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ContentStyle, CaptionStyle } from '../types';
import { Save, Plus, X, AlertTriangle, Check, Trash2, Key, Info } from 'lucide-react';

interface SettingsPageProps {
  onNavigate: (path: string) => void;
}

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
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [enableDevAuthorizedSource, setEnableDevAuthorizedSource] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
      setYoutubeApiKey(workspace.settings.youtubeApiKey || '');
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
        youtubeApiKey: youtubeApiKey.trim() || undefined,
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
        'WARNING: This will clear all workspace configuration, discovered sources, candidate moments, clips, and internal queue items from LocalStorage. Proceed?',
      )
    ) {
      await resetWorkspace();
      onNavigate('/onboarding');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Workspace Configuration
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Configure dynamic niche parameters, video branding rules, and discovery providers.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-xs font-semibold rounded-md bg-zinc-100 text-zinc-950 hover:bg-white transition cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-1.5 self-start sm:self-auto"
        >
          {saveSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Niche & Discovery Angles */}
        <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            Content Niche & Angles
          </h3>
          <p className="text-xs text-zinc-400">
            ClipFlow derives multiple search queries dynamically from these values. Never hard-coded.
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Target Niche
            </label>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. Men's fashion, Cyber security, Solo founder SaaS"
              className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Subtopics & Angle Refinements
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newSubtopic}
                onChange={(e) => setNewSubtopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtopic();
                  }
                }}
                placeholder="e.g. Streetwear, wardrobe mistakes, tailoring"
                className="flex-1 px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => handleAddSubtopic()}
                className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {subtopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {subtopics.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtopic(t)}
                      className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content & Video Preferences */}
        <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            Rendering & Editorial Preferences
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Content Extraction Style
              </label>
              <select
                value={contentStyle}
                onChange={(e) => setContentStyle(e.target.value as ContentStyle)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="breakdown">Breakdown & Tactical Analysis</option>
                <option value="educational">Educational & Explainer</option>
                <option value="storytelling">Storytelling & Narrative</option>
                <option value="commentary">Commentary & Insights</option>
                <option value="interview">Interview & Dialogue</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Social Caption Style
              </label>
              <select
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value as CaptionStyle)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="bold_punchy">Bold & Punchy Hook</option>
                <option value="clean_subtle">Clean & Editorial</option>
                <option value="karaoke_highlight">Quote Highlight</option>
                <option value="minimal">Minimalist</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Brand Accent Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandAccent}
                  onChange={(e) => setBrandAccent(e.target.value)}
                  className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                />
                <span className="text-xs font-mono text-zinc-400">{brandAccent}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-zinc-200">Burn Subtitles into Output MP4</span>
                <p className="text-[11px] text-zinc-500">
                  Renders subtitle text directly into the 1080x1920 video stream via FFmpeg.
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
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-zinc-400">Uppercase formatting</span>
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

        {/* Discovery & Media Providers */}
        <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">
                Discovery & Media Providers
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                ClipFlow never fabricates dummy results or fake video files.
              </p>
            </div>
          </div>

          {/* YouTube Data API Configuration */}
          <div className="p-4 rounded-md bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-400" />
              <label className="text-xs font-semibold text-zinc-200">
                YouTube Data API v3 Key (Production Discovery)
              </label>
            </div>
            <input
              type="password"
              value={youtubeApiKey}
              onChange={(e) => setYoutubeApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
            />
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              When configured, ClipFlow queries YouTube Data API v3 directly across your configured niche and subtopic angles, returning verified external source records and authentic published durations.
            </p>
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
                  Permits local end-to-end testing using our verified, authorized Creative Commons moving media sample. Exercises the real 1080x1920 FFmpeg rendering and FFprobe validation pipeline directly without requiring third-party API credentials.
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
