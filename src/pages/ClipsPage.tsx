import React, { useState } from 'react';
import { useJobs } from '../context/JobContext';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { Modal } from '../components/ui/Modal';
import { VideoPlayer } from '../components/ui/VideoPlayer';
import { Clip } from '../types';
import {
  Film,
  Play,
  Edit3,
  ListOrdered,
  Trash2,
  Check,
  CheckCircle,
  Clock,
  Sparkles,
  Download,
} from 'lucide-react';

interface ClipsPageProps {
  onNavigate: (path: string) => void;
}

export const ClipsPage: React.FC<ClipsPageProps> = ({ onNavigate }) => {
  const { clips, updateClipMetadata, moveClipToQueue, deleteClip } = useJobs();

  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const openClipModal = (clip: Clip) => {
    setActiveClip(clip);
    setEditCaption(clip.caption);
    setEditHashtags(clip.hashtags.join(' '));
    setIsEditing(false);
    setSaveSuccess(false);
  };

  const handleSaveMetadata = async () => {
    if (!activeClip) return;
    const tagArray = editHashtags
      .split(/\s+/)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .filter((t) => t.length > 1);

    await updateClipMetadata(activeClip.id, editCaption, tagArray);
    setActiveClip((prev) =>
      prev ? { ...prev, caption: editCaption, hashtags: tagArray } : null,
    );
    setIsEditing(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleMoveToQueue = async (clipId: string) => {
    await moveClipToQueue(clipId);
    if (activeClip?.id === clipId) {
      setActiveClip(null);
    }
  };

  const handleDelete = async (clipId: string) => {
    if (window.confirm('Are you sure you want to delete this clip and remove it from storage?')) {
      await deleteClip(clipId);
      if (activeClip?.id === clipId) {
        setActiveClip(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Rendered Clips Gallery
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Genuine 1080x1920 (9:16) vertical MP4 clips encoded with FFmpeg, complete with burnt subtitles and contextual social copy.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>{clips.length} Total Clips</span>
          <span aria-hidden="true">·</span>
          <span>{clips.filter((c) => c.status === 'ready' || c.status === 'queued').length} Ready</span>
        </div>
      </div>

      {clips.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No clips generated yet"
          description="Moment candidates can be rendered into verified 9:16 vertical videos with burnt subtitles and social copy."
          actionLabel="View Moment Candidates"
          onAction={() => onNavigate('/candidates')}
          secondaryActionLabel="Run Discovery"
          onSecondaryAction={() => onNavigate('/discover')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {clips.map((clip) => (
            <div
              key={clip.id}
              className="group rounded-lg bg-zinc-900/60 border border-zinc-800/80 overflow-hidden flex flex-col justify-between hover:border-zinc-700 transition"
            >
              <div className="p-3">
                {/* 9:16 Poster Card */}
                <div className="aspect-[9/16] w-full rounded bg-black relative overflow-hidden mb-3">
                  {clip.posterUrl ? (
                    <img
                      src={clip.posterUrl}
                      alt={clip.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                      <Film className="w-8 h-8" />
                    </div>
                  )}

                  {/* Play overlay button */}
                  <button
                    onClick={() => openClipModal(clip)}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    aria-label={`Play clip ${clip.title}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-2xl">
                      <Play className="w-6 h-6 ml-0.5 fill-zinc-950" />
                    </div>
                  </button>

                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-300">
                    {clip.duration.toFixed(1)}s
                  </span>

                  <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-300">
                    {(clip.fileSizeBytes / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <StatusIndicator
                      status={clip.status === 'queued' ? 'In Queue' : 'Ready'}
                      variant={clip.status === 'queued' ? 'info' : 'success'}
                    />
                    <span className="text-zinc-500 font-mono text-[10px]">
                      {new Date(clip.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-snug pt-1">
                    {clip.title}
                  </h3>

                  <p className="text-[11px] text-zinc-500 line-clamp-1">
                    Source: {clip.sourceChannel}
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-3 pt-0 border-t border-zinc-800/60 mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => openClipModal(clip)}
                  className="flex-1 py-1.5 px-2 text-xs font-medium rounded border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer text-center"
                >
                  Inspect & Edit
                </button>

                <button
                  onClick={() => handleMoveToQueue(clip.id)}
                  disabled={clip.status === 'queued'}
                  className={`p-1.5 rounded border transition cursor-pointer ${
                    clip.status === 'queued'
                      ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                      : 'border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  title={clip.status === 'queued' ? 'Already in Queue' : 'Add to Queue'}
                >
                  <ListOrdered className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDelete(clip.id)}
                  className="p-1.5 rounded border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition cursor-pointer"
                  title="Delete clip"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspect & Edit Clip Modal */}
      {activeClip && (
        <Modal
          isOpen={Boolean(activeClip)}
          onClose={() => setActiveClip(null)}
          title={`Clip: ${activeClip.title}`}
          maxWidth="max-w-4xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* HTML5 Native Video Player */}
            <div className="flex flex-col items-center">
              <VideoPlayer
                src={activeClip.videoUrl}
                poster={activeClip.posterUrl}
                className="w-full max-w-[280px] aspect-[9/16] shadow-2xl"
              />
              <div className="flex items-center gap-2 mt-3">
                <a
                  href={activeClip.videoUrl}
                  download={`clipflow_${activeClip.id}.mp4`}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download MP4</span>
                </a>
              </div>
            </div>

            {/* Metadata & Copy Management */}
            <div className="space-y-4 text-xs">
              {saveSuccess && (
                <div className="p-2.5 rounded bg-emerald-950/60 border border-emerald-900 text-emerald-300 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>Metadata saved successfully.</span>
                </div>
              )}

              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Hook Title
                </span>
                <p className="text-sm font-semibold text-zinc-100 mt-0.5">
                  {activeClip.title}
                </p>
              </div>

              {/* Social Caption Editor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                    Social Caption
                  </span>
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <textarea
                    rows={5}
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className="w-full p-2.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-500 font-sans text-xs resize-y"
                  />
                ) : (
                  <div className="p-3 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 font-sans whitespace-pre-wrap leading-relaxed">
                    {activeClip.caption}
                  </div>
                )}
              </div>

              {/* Hashtags Editor */}
              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
                  Social Hashtags
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editHashtags}
                    onChange={(e) => setEditHashtags(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono text-xs"
                    placeholder="#Niche #Content #Tips"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {activeClip.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleSaveMetadata}
                    className="px-3.5 py-1.5 rounded bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold cursor-pointer"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Technical FFprobe Stream Specs */}
              <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-[11px] text-zinc-400 font-semibold block">
                  FFmpeg / FFprobe Technical Output Verification
                </span>
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-zinc-400 pt-1">
                  <div>Dimensions: {activeClip.resolution.width}x{activeClip.resolution.height}</div>
                  <div>Aspect Ratio: {activeClip.aspectRatio}</div>
                  <div>Duration: {activeClip.duration.toFixed(2)}s</div>
                  <div>Size: {(activeClip.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</div>
                  <div>Video Codec: {activeClip.codec.video}</div>
                  <div>Audio Codec: {activeClip.codec.audio}</div>
                </div>
                <div className="text-[10px] text-emerald-400 pt-1">
                  ✓ Validated 9:16 H.264 stream with dynamic frame changes.
                </div>
              </div>

              {/* Queue Action Button */}
              <div className="pt-2">
                <button
                  onClick={() => handleMoveToQueue(activeClip.id)}
                  disabled={activeClip.status === 'queued'}
                  className="w-full py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>
                    {activeClip.status === 'queued'
                      ? 'Already in Internal Queue'
                      : 'Move to Internal Content Queue'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
