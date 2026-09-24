import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  ContentStyle,
  CaptionStyle,
  WorkspaceSettings,
} from '../types';
import { ArrowRight, Flame, Plus, X, Check } from 'lucide-react';

interface OnboardingPageProps {
  onComplete: () => void;
}

export const OnboardingPage: React.FC<OnboardingPageProps> = ({ onComplete }) => {
  const { createWorkspace } = useWorkspace();

  const [workspaceName, setWorkspaceName] = useState('My Content Engine');
  const [niche, setNiche] = useState('');
  const [subtopics, setSubtopics] = useState<string[]>([]);
  const [subtopicInput, setSubtopicInput] = useState('');
  const [language, setLanguage] = useState('en');
  const [contentStyle, setContentStyle] = useState<ContentStyle>('breakdown');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('bold_punchy');
  const [brandAccent, setBrandAccent] = useState('#3b82f6');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitlesUppercase, setSubtitlesUppercase] = useState(true);
  const [enableDevAuthorizedSource, setEnableDevAuthorizedSource] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSubtopic = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = subtopicInput.trim();
    if (!clean) return;
    if (!subtopics.includes(clean)) {
      setSubtopics([...subtopics, clean]);
    }
    setSubtopicInput('');
  };

  const handleRemoveSubtopic = (topic: string) => {
    setSubtopics(subtopics.filter((t) => t !== topic));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim()) {
      setError('Please specify a target niche for discovery.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const settings: WorkspaceSettings = {
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
    };

    try {
      await createWorkspace(workspaceName.trim() || 'My Content Engine', settings);
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize workspace.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-zinc-800">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-100 text-zinc-950 mb-3 shadow-lg">
            <Flame className="w-6 h-6 fill-zinc-950" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Create your ClipFlow Workspace
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
            ClipFlow automatically discovers high-retention long-form sources, analyzes key moments, and cuts 9:16 vertical video clips.
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900 border border-zinc-800/80 rounded-lg p-6 space-y-6 shadow-2xl"
        >
          {error && (
            <div className="p-3 text-xs rounded bg-rose-950/60 border border-rose-900/80 text-rose-300">
              {error}
            </div>
          )}

          {/* Workspace Name & Niche */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Workspace Name
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Creator Studio 1"
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Primary Niche <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Men's Fashion, Architecture, B2B SaaS, Culinary Techniques"
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500 transition"
                required
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Enter any niche. ClipFlow dynamically derives content discovery angles from this.
              </p>
            </div>

            {/* Subtopics */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Subtopics & Angles (Optional)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={subtopicInput}
                  onChange={(e) => setSubtopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtopic();
                    }
                  }}
                  placeholder="e.g. Streetwear, wardrobe essentials, color theory"
                  className="flex-1 px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-500 transition"
                />
                <button
                  type="button"
                  onClick={() => handleAddSubtopic()}
                  className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs font-medium flex items-center gap-1 cursor-pointer transition"
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

          <hr className="border-zinc-800" />

          {/* Preferences */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Content Style
              </label>
              <select
                value={contentStyle}
                onChange={(e) => setContentStyle(e.target.value as ContentStyle)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-500 transition cursor-pointer"
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
                Caption Style
              </label>
              <select
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value as CaptionStyle)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-500 transition cursor-pointer"
              >
                <option value="bold_punchy">Bold & Punchy Hook</option>
                <option value="clean_subtle">Clean & Editorial</option>
                <option value="karaoke_highlight">Quote Highlight</option>
                <option value="minimal">Minimalist</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Source Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-500 transition cursor-pointer"
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

          {/* Subtitle Options */}
          <div className="p-3.5 bg-zinc-950/70 border border-zinc-800/80 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-zinc-200">Burn Subtitles into Video</span>
                <p className="text-[11px] text-zinc-500">Render dynamic text overlay in 9:16 vertical video.</p>
              </div>
              <input
                type="checkbox"
                checked={subtitlesEnabled}
                onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </div>
            {subtitlesEnabled && (
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                <span className="text-xs text-zinc-400">Uppercase formatting</span>
                <input
                  type="checkbox"
                  checked={subtitlesUppercase}
                  onChange={(e) => setSubtitlesUppercase(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Pipeline Provider Option */}
          <div className="p-3.5 bg-zinc-950/70 border border-zinc-800/80 rounded-md space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-200">
                  Enable Isolated Development Media Testing
                </span>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Allows instant local test drives using our verified authorized Creative Commons moving media sample. Exercises the genuine 1080x1920 FFmpeg rendering engine immediately without needing third-party API keys.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enableDevAuthorizedSource}
                onChange={(e) => setEnableDevAuthorizedSource(e.target.checked)}
                className="w-4 h-4 mt-1 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition cursor-pointer shadow-md disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Initializing Workspace...</span>
            ) : (
              <>
                <span>Launch ClipFlow Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
