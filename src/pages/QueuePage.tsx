import React, { useState } from 'react';
import { useJobs } from '../context/JobContext';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { Modal } from '../components/ui/Modal';
import { VideoPlayer } from '../components/ui/VideoPlayer';
import { QueueItem, QueueItemStatus } from '../types';
import {
  ListOrdered,
  Play,
  Film,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface QueuePageProps {
  onNavigate: (path: string) => void;
}

export const QueuePage: React.FC<QueuePageProps> = ({ onNavigate }) => {
  const { queueItems, updateQueueItemStatus } = useJobs();
  const [selectedQueueItem, setSelectedQueueItem] = useState<QueueItem | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'needs_review' | 'ready' | 'queued'>('all');

  const filteredItems = queueItems.filter((item) => {
    if (activeTab === 'needs_review') return item.status === 'Needs Review';
    if (activeTab === 'ready') return item.status === 'Ready';
    if (activeTab === 'queued') return item.status === 'Queued';
    return true;
  });

  const getStatusVariant = (status: QueueItemStatus) => {
    switch (status) {
      case 'Needs Review':
        return 'warning';
      case 'Ready':
        return 'success';
      case 'Queued':
        return 'info';
      default:
        return 'neutral';
    }
  };

  const handleStatusChange = async (itemId: string, newStatus: QueueItemStatus) => {
    await updateQueueItemStatus(itemId, newStatus);
    if (selectedQueueItem?.id === itemId) {
      setSelectedQueueItem((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Internal Content Queue
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Organize rendered clips through internal review, ready verification, and queue staging.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-md text-xs">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'needs_review', label: 'Needs Review' },
            { id: 'ready', label: 'Ready' },
            { id: 'queued', label: 'Queued' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="Queue is empty"
          description={
            queueItems.length === 0
              ? 'Render a candidate moment to automatically populate your internal content review queue.'
              : `No queue items match the "${activeTab}" view.`
          }
          actionLabel={queueItems.length === 0 ? 'Go to Candidates' : 'Show All Items'}
          onAction={() =>
            queueItems.length === 0 ? onNavigate('/candidates') : setActiveTab('all')
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>
              {filteredItems.length} Item{filteredItems.length === 1 ? '' : 's'} in Queue
            </span>
            <span>Internal Workflow: Needs Review → Ready → Queued</span>
          </div>

          <div className="space-y-3">
            {filteredItems.map((item) => {
              const clip = item.clip;

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-zinc-700"
                >
                  {/* Left: Thumbnail & Details */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div
                      onClick={() => setSelectedQueueItem(item)}
                      className="w-16 h-28 sm:w-20 sm:h-32 rounded bg-black shrink-0 overflow-hidden relative cursor-pointer group"
                    >
                      {clip.posterUrl ? (
                        <img
                          src={clip.posterUrl}
                          alt={clip.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Film className="w-6 h-6" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <Play className="w-5 h-5 fill-white text-white" />
                      </div>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                        <StatusIndicator
                          status={item.status}
                          variant={getStatusVariant(item.status)}
                        />
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{clip.duration.toFixed(1)}s</span>
                        <span aria-hidden="true">·</span>
                        <span>9:16 Vertical (1080x1920)</span>
                        <span aria-hidden="true">·</span>
                        <span>{(clip.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                      </div>

                      <h3
                        onClick={() => setSelectedQueueItem(item)}
                        className="text-sm font-semibold text-zinc-100 hover:text-white cursor-pointer line-clamp-1"
                      >
                        {clip.title}
                      </h3>

                      <p className="text-xs text-zinc-400 line-clamp-2">
                        {clip.caption}
                      </p>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {clip.hashtags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-mono text-zinc-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: State Selector & Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">Status:</span>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleStatusChange(item.id, e.target.value as QueueItemStatus)
                        }
                        className="px-2.5 py-1 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-500 cursor-pointer"
                      >
                        <option value="Needs Review">Needs Review</option>
                        <option value="Ready">Ready</option>
                        <option value="Queued">Queued</option>
                      </select>
                    </div>

                    <button
                      onClick={() => setSelectedQueueItem(item)}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
                    >
                      View & Play
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue Item Preview Modal */}
      {selectedQueueItem && (
        <Modal
          isOpen={Boolean(selectedQueueItem)}
          onClose={() => setSelectedQueueItem(null)}
          title={`Queue Item: ${selectedQueueItem.clip.title}`}
          maxWidth="max-w-3xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="flex justify-center">
              <VideoPlayer
                src={selectedQueueItem.clip.videoUrl}
                poster={selectedQueueItem.clip.posterUrl}
                className="w-full max-w-[280px] aspect-[9/16]"
              />
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <span className="text-zinc-400">Queue Stage:</span>
                <select
                  value={selectedQueueItem.status}
                  onChange={(e) =>
                    handleStatusChange(
                      selectedQueueItem.id,
                      e.target.value as QueueItemStatus,
                    )
                  }
                  className="px-2.5 py-1 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none"
                >
                  <option value="Needs Review">Needs Review</option>
                  <option value="Ready">Ready</option>
                  <option value="Queued">Queued</option>
                </select>
              </div>

              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Hook Title
                </span>
                <p className="text-sm font-semibold text-zinc-100 mt-0.5">
                  {selectedQueueItem.clip.title}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Caption
                </span>
                <div className="mt-1 p-3 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 whitespace-pre-wrap font-sans">
                  {selectedQueueItem.clip.caption}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Hashtags
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedQueueItem.clip.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => onNavigate('/clips')}
                  className="w-full py-2 rounded border border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs font-semibold cursor-pointer"
                >
                  Edit in Clips Gallery
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
