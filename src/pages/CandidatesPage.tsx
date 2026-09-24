import React, { useState } from 'react';
import { useJobs } from '../context/JobContext';
import { EmptyState } from '../components/ui/EmptyState';
import { ClipCandidate, SourceVideo, AuthorizedMediaSource, MediaSourceType } from '../types';
import {
  Sparkles,
  Film,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  ExternalLink,
  RotateCw,
  PlayCircle,
  Check,
  X,
  SlidersHorizontal,
  Flame,
  FileCheck2,
  ShieldCheck,
  UploadCloud,
  FileVideo,
  Terminal,
  Activity,
  CheckCheck,
} from 'lucide-react';

interface CandidatesPageProps {
  onNavigate: (path: string) => void;
}

export const CandidatesPage: React.FC<CandidatesPageProps> = ({ onNavigate }) => {
  const {
    candidates,
    sources,
    renderCandidate,
    analyzeSource,
    retryAnalysis,
    approveCandidate,
    rejectCandidate,
    attachAuthorizedMedia,
    testAuthorizedMediaPipeline,
    activeJob,
  } = useJobs();

  const [renderingCandidateId, setRenderingCandidateId] = useState<string | null>(null);
  const [analyzingSourceId, setAnalyzingSourceId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectionModalId, setRejectionModalId] = useState<string | null>(null);
  const [rejectionCustomReason, setRejectionCustomReason] = useState<string>('');

  // Media Attachment Modal State
  const [attachMediaModalCandidate, setAttachMediaModalCandidate] = useState<ClipCandidate | null>(null);
  const [attachSourceType, setAttachSourceType] = useState<MediaSourceType>('AUTHORIZED_DIRECT_URL');
  const [attachMediaUrl, setAttachMediaUrl] = useState<string>('');
  const [attachContentId, setAttachContentId] = useState<string>('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Diagnostic Test Pipeline Modal State
  const [isTestingPipeline, setIsTestingPipeline] = useState(false);
  const [pipelineTestResult, setPipelineTestResult] = useState<{
    success: boolean;
    stepResults: Array<{ step: string; status: 'passed' | 'failed'; details: string }>;
    validatedMedia?: any;
    handoff?: any;
  } | null>(null);
  const [showPipelineTestModal, setShowPipelineTestModal] = useState(false);

  // Unanalyzed or failed sources that can be analyzed/retried
  const pendingSources = sources.filter(
    (s) => s.status === 'discovered' || s.status === 'failed',
  );

  const filteredCandidates = candidates.filter((c) => {
    // Quality Tier Filter
    if (filterTier !== 'all' && c.qualityTier.toLowerCase() !== filterTier.toLowerCase()) {
      return false;
    }
    // Status Filter
    if (filterStatus === 'all') return true;
    if (filterStatus === 'approved') return c.status === 'approved' || c.status === 'selected';
    if (filterStatus === 'rejected') return c.status === 'rejected';
    if (filterStatus === 'detected') return c.status === 'detected';
    return true;
  });

  const handleRender = async (candidate: ClipCandidate) => {
    // Check if media is ready
    if (candidate.mediaState !== 'MEDIA_READY') {
      setAttachMediaModalCandidate(candidate);
      setAttachError(
        'Authorized moving media is required before rendering. YouTube watch URLs are discovery references only.',
      );
      return;
    }

    setRenderingCandidateId(candidate.id);
    setErrorMessage(null);
    try {
      await renderCandidate(candidate);
      onNavigate('/clips');
    } catch (err: any) {
      setErrorMessage(err.message || 'Render failed.');
    } finally {
      setRenderingCandidateId(null);
    }
  };

  const handleAnalyzeSource = async (source: SourceVideo) => {
    setAnalyzingSourceId(source.id);
    setErrorMessage(null);
    try {
      if (source.status === 'failed') {
        await retryAnalysis(source.id);
      } else {
        await analyzeSource(source);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Analysis failed.');
    } finally {
      setAnalyzingSourceId(null);
    }
  };

  const handleApprove = async (candidateId: string) => {
    setErrorMessage(null);
    try {
      await approveCandidate(candidateId);
    } catch (err: any) {
      setErrorMessage(err.message || 'Approve failed.');
    }
  };

  const handleOpenRejectModal = (candidateId: string) => {
    setRejectionModalId(candidateId);
    setRejectionCustomReason('');
  };

  const handleConfirmReject = async (candidateId: string) => {
    try {
      await rejectCandidate(
        candidateId,
        rejectionCustomReason.trim() || 'Candidate does not meet short-form engagement criteria.',
      );
      setRejectionModalId(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Reject failed.');
    }
  };

  const handleOpenAttachModal = (candidate: ClipCandidate) => {
    setAttachMediaModalCandidate(candidate);
    setAttachSourceType(candidate.mediaSource?.sourceType || 'AUTHORIZED_DIRECT_URL');
    setAttachMediaUrl(candidate.mediaSource?.mediaUrl || '');
    setAttachContentId(candidate.mediaSource?.contentIdentifier || candidate.sourceVideoId);
    setAttachError(null);
  };

  const handleConfirmAttachMedia = async () => {
    if (!attachMediaModalCandidate) return;
    if (!attachMediaUrl.trim()) {
      setAttachError('Media URL or storage path is required.');
      return;
    }

    setIsAttaching(true);
    setAttachError(null);

    const mediaSource: AuthorizedMediaSource = {
      sourceType: attachSourceType,
      mediaUrl: attachMediaUrl.trim(),
      authorizationStatus: 'authorized',
      provider:
        attachSourceType === 'AUTHORIZED_DIRECT_URL'
          ? 'direct_partner'
          : 'authorized_storage',
      contentIdentifier: attachContentId.trim() || attachMediaModalCandidate.sourceVideoId,
      acquiredAt: new Date().toISOString(),
      validationStatus: 'pending',
    };

    try {
      await attachAuthorizedMedia(attachMediaModalCandidate.id, mediaSource);
      setAttachMediaModalCandidate(null);
    } catch (err: any) {
      setAttachError(err.message || 'Media acquisition or validation failed.');
    } finally {
      setIsAttaching(false);
    }
  };

  const handleRunPipelineTest = async () => {
    setIsTestingPipeline(true);
    setShowPipelineTestModal(true);
    setPipelineTestResult(null);

    try {
      const result = await testAuthorizedMediaPipeline();
      setPipelineTestResult(result);
    } catch (err: any) {
      setPipelineTestResult({
        success: false,
        stepResults: [
          {
            step: 'TEST_PIPELINE',
            status: 'failed',
            details: err.message || 'Pipeline test execution encountered an error.',
          },
        ],
      });
    } finally {
      setIsTestingPipeline(false);
    }
  };

  const totalApproved = candidates.filter((c) => c.status === 'approved' || c.status === 'selected').length;
  const totalRejected = candidates.filter((c) => c.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <span>Candidate Moments</span>
            {candidates.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                {candidates.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Real short-form hooks and high-retention segments detected from genuine source videos and persisted to Firestore.
          </p>
        </div>

        {/* Top Actions & Stats */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Dev Action: Test Authorized Media Pipeline */}
          <button
            onClick={handleRunPipelineTest}
            disabled={isTestingPipeline || Boolean(activeJob)}
            className="px-3.5 py-1.5 rounded-md bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 font-medium transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            title="Runs the authorized media acquisition and ffprobe frame-progression validation test sample"
          >
            {isTestingPipeline ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>Test Authorized Media Pipeline</span>
          </button>

          <div className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Approved: <strong className="text-zinc-100">{totalApproved}</strong></span>
          </div>
          <div className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Rejected: <strong className="text-zinc-100">{totalRejected}</strong></span>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {errorMessage && (
        <div className="p-4 rounded-md bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Pipeline Notice</span>
            <p className="text-[11px] leading-relaxed">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Sources Needing Analysis Prompt Banner */}
      {pendingSources.length > 0 && (
        <div className="p-4 rounded-lg bg-zinc-900/60 border border-amber-900/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <h4 className="text-xs font-semibold text-zinc-200">
                {pendingSources.length} Source Video{pendingSources.length === 1 ? '' : 's'} Ready for Moment Detection
              </h4>
            </div>
            <p className="text-[11px] text-zinc-400">
              Run real timestamped moment extraction and transparent scoring on discovered sources.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pendingSources.slice(0, 3).map((src) => {
              const isAnalyzing = analyzingSourceId === src.id;
              const isFailed = src.status === 'failed';
              return (
                <button
                  key={src.id}
                  onClick={() => handleAnalyzeSource(src)}
                  disabled={isAnalyzing || Boolean(activeJob)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition flex items-center gap-1.5 ${
                    isFailed
                      ? 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                  } disabled:opacity-50`}
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isFailed ? (
                    <RotateCw className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <PlayCircle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span className="truncate max-w-[160px]">
                    {isAnalyzing ? 'Analyzing...' : isFailed ? `Retry: ${src.title}` : `Analyze: ${src.title}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter and View Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-md text-xs">
          {[
            { id: 'all', label: 'All Status' },
            { id: 'detected', label: 'Pending Review' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterStatus(item.id)}
              className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
                filterStatus === item.id
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Quality Tier Filters */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-md text-xs">
          <span className="text-[11px] text-zinc-500 pl-2 pr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3" /> Tier:
          </span>
          {['all', 'excellent', 'strong', 'potential'].map((tier) => (
            <button
              key={tier}
              onClick={() => setFilterTier(tier)}
              className={`px-2.5 py-1 rounded capitalize font-medium transition cursor-pointer ${
                filterTier === tier
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Candidates List or Empty State */}
      {candidates.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No Candidate Moments Detected"
          description={
            sources.length > 0
              ? 'Discovered source videos exist in Firestore. Click "Analyze" on any source to detect high-retention short-form moments.'
              : 'Run automatic discovery on the Discovery page to find niche videos, then analyze them to detect short-form moments.'
          }
          actionLabel={sources.length > 0 ? undefined : 'Go to Discovery'}
          onAction={sources.length > 0 ? undefined : () => onNavigate('/discovery')}
        />
      ) : filteredCandidates.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-400 rounded-lg border border-zinc-800 bg-zinc-900/40">
          No candidates match the active filter criteria ({filterStatus} status, {filterTier} tier).
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>
              Showing {filteredCandidates.length} of {candidates.length} candidates
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredCandidates.map((cand) => {
              const isExpanded = expandedId === cand.id;
              const isRendering = renderingCandidateId === cand.id;
              const isApproved = cand.status === 'approved' || cand.status === 'selected';
              const isRejected = cand.status === 'rejected';
              const isRendered = cand.status === 'rendered';

              // Media State Mapping
              const mediaState = cand.mediaState || (cand.sourceUrl?.includes('youtube.com') || cand.sourceUrl?.includes('youtu.be') ? 'MEDIA_UNAVAILABLE' : 'MEDIA_REQUIRED');

              const getTierColor = (tier: string) => {
                switch (tier) {
                  case 'Excellent':
                    return 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80';
                  case 'Strong':
                    return 'bg-blue-950/70 text-blue-300 border-blue-800/80';
                  case 'Potential':
                    return 'bg-amber-950/70 text-amber-300 border-amber-800/80';
                  default:
                    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
                }
              };

              return (
                <div
                  key={cand.id}
                  className={`rounded-lg border transition-all ${
                    isRendered
                      ? 'border-emerald-800/60 bg-zinc-900/80'
                      : isApproved
                      ? 'border-zinc-700/80 bg-zinc-900/70 shadow-sm'
                      : isRejected
                      ? 'border-zinc-800/60 bg-zinc-950/50 opacity-75'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  {/* Main Card Header & Details */}
                  <div className="p-5 flex flex-col md:flex-row gap-5">
                    {/* Left: Moment Info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Overall Score Badge */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800/90 border border-zinc-700 font-mono font-bold text-zinc-100">
                          <Flame className="w-3.5 h-3.5 text-amber-400" />
                          <span>Score {cand.scores.overall}/100</span>
                        </div>

                        {/* Quality Tier */}
                        <span
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${getTierColor(
                            cand.qualityTier,
                          )}`}
                        >
                          {cand.qualityTier} Tier
                        </span>

                        {/* Duration Pill */}
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                          {cand.duration}s
                        </span>

                        {/* Timestamp Window */}
                        <span className="text-zinc-400 font-mono text-[11px] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          {Math.floor(cand.startTime / 60)}:
                          {(cand.startTime % 60).toString().padStart(2, '0')} —{' '}
                          {Math.floor(cand.endTime / 60)}:
                          {(cand.endTime % 60).toString().padStart(2, '0')}
                        </span>

                        <span aria-hidden="true" className="text-zinc-600">·</span>

                        {/* Confidence */}
                        <span className="text-zinc-400 text-xs">
                          Confidence: <strong className="text-zinc-200">{cand.confidence || 85}%</strong>
                        </span>

                        {/* Review Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ml-auto ${
                            isRendered
                              ? 'bg-emerald-900/50 text-emerald-300'
                              : isApproved
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                              : isRejected
                              ? 'bg-rose-950/60 text-rose-400 border border-rose-800'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {isRendered ? 'Rendered' : isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending Review'}
                        </span>
                      </div>

                      {/* Hook Headline */}
                      <h3 className="text-base font-semibold text-zinc-100 leading-snug">
                        {cand.hook}
                      </h3>

                      {/* Summary / Context */}
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        <span className="text-zinc-500 font-medium">Moment Summary:</span>{' '}
                        {cand.summary || cand.context}
                      </p>

                      {/* Payoff */}
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        <span className="text-zinc-500 font-medium">Payoff:</span> {cand.payoff}
                      </p>

                      {/* Media Acquisition & Validation Status Banner */}
                      <div className="pt-1">
                        {mediaState === 'MEDIA_READY' ? (
                          <div className="p-2.5 rounded-md bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                              <div className="space-y-0.5">
                                <span className="font-semibold text-emerald-200">
                                  Authorized Moving Media Verified (Ready to Render)
                                </span>
                                {cand.mediaValidation && (
                                  <p className="text-[11px] text-emerald-400/90 font-mono">
                                    {cand.mediaValidation.width}x{cand.mediaValidation.height} ·{' '}
                                    {cand.mediaValidation.durationSeconds.toFixed(1)}s moving stream · Frame progression verified
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700">
                              MEDIA_READY
                            </span>
                          </div>
                        ) : mediaState === 'MEDIA_VALIDATING' ? (
                          <div className="p-2.5 rounded-md bg-purple-950/40 border border-purple-800/60 text-xs text-purple-300 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
                              <span className="font-medium">
                                Probing container, codecs, and frame progression with ffprobe...
                              </span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900/60 text-purple-300">
                              MEDIA_VALIDATING
                            </span>
                          </div>
                        ) : mediaState === 'MEDIA_INVALID' ? (
                          <div className="p-2.5 rounded-md bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 font-semibold text-rose-200">
                                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                                <span>Media Validation Rejected</span>
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700">
                                MEDIA_INVALID
                              </span>
                            </div>
                            <p className="text-[11px] text-rose-300 leading-relaxed">
                              {cand.mediaError || 'Media failed validation. Moving video file required.'}
                            </p>
                            <button
                              onClick={() => handleOpenAttachModal(cand)}
                              className="text-[11px] font-medium text-rose-200 hover:text-white underline cursor-pointer mt-1 inline-block"
                            >
                              Attach New Authorized Media Source
                            </button>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-md bg-zinc-900 border border-amber-900/50 text-xs text-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Authorized Media Source Required to Render</span>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-relaxed">
                                YouTube Data API is metadata-only. To comply with YouTube Terms of Service, ClipFlow does not scrape or extract streams from YouTube. Provide an authorized moving media source (AUTHORIZED_DIRECT_URL or AUTHORIZED_STORAGE) to render.
                              </p>
                            </div>
                            <button
                              onClick={() => handleOpenAttachModal(cand)}
                              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium text-xs shrink-0 cursor-pointer transition flex items-center gap-1.5"
                            >
                              <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                              <span>Attach Media</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Rejection Reason Notice */}
                      {isRejected && cand.rejectionReason && (
                        <div className="p-2.5 rounded bg-rose-950/30 border border-rose-900/50 text-[11px] text-rose-300 flex items-start gap-1.5 mt-2">
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Rejection Reason:</strong> {cand.rejectionReason}
                          </span>
                        </div>
                      )}

                      {/* Source Reference & View Source */}
                      <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-zinc-500">Source:</span>
                        <span className="text-zinc-300 truncate font-medium max-w-sm">
                          {cand.sourceTitle}
                        </span>
                        {cand.sourceUrl && (
                          <a
                            href={cand.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 ml-1 text-xs cursor-pointer"
                            title="View original YouTube source"
                          >
                            <span>View Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex flex-row md:flex-col items-end md:items-end justify-between md:justify-start gap-2.5 shrink-0">
                      {isRendered ? (
                        <button
                          onClick={() => onNavigate('/clips')}
                          className="px-4 py-2 text-xs font-semibold rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>View Clip</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRender(cand)}
                          disabled={isRendering || Boolean(activeJob) || isRejected}
                          className={`px-4 py-2 text-xs font-semibold rounded-md transition cursor-pointer shadow-sm disabled:opacity-40 flex items-center gap-1.5 ${
                            mediaState === 'MEDIA_READY'
                              ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                          title={
                            mediaState === 'MEDIA_READY'
                              ? 'Render this validated candidate into a 9:16 vertical clip'
                              : 'Authorized moving media required to render'
                          }
                        >
                          {isRendering ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Rendering 9:16...</span>
                            </>
                          ) : (
                            <>
                              <Film className="w-3.5 h-3.5" />
                              <span>{mediaState === 'MEDIA_READY' ? 'Render 9:16 Clip' : 'Attach Media to Render'}</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Approval / Rejection Controls */}
                      {!isRendered && (
                        <div className="flex items-center gap-1.5">
                          {!isApproved && (
                            <button
                              onClick={() => handleApprove(cand.id)}
                              className="px-2.5 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 hover:border-emerald-600 transition cursor-pointer flex items-center gap-1"
                              title="Approve moment candidate"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          )}

                          {!isRejected && (
                            <button
                              onClick={() => handleOpenRejectModal(cand.id)}
                              className="px-2.5 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-rose-400 border border-zinc-700 hover:border-rose-600 transition cursor-pointer flex items-center gap-1"
                              title="Reject moment candidate with recorded reason"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Expand / Collapse Rationale Button */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : cand.id)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 transition flex items-center gap-1 cursor-pointer pt-1"
                      >
                        <span>{isExpanded ? 'Hide Breakdown' : 'Score Factors'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Scoring Breakdown */}
                  {isExpanded && (
                    <div className="px-5 py-4 bg-zinc-950/70 border-t border-zinc-800/80 space-y-3 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                            Hook Strength
                          </span>
                          <span className="text-sm font-semibold font-mono text-zinc-200">
                            {cand.scores.hook}/100
                          </span>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                            Curiosity
                          </span>
                          <span className="text-sm font-semibold font-mono text-zinc-200">
                            {cand.scores.curiosity}/100
                          </span>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                            Payoff
                          </span>
                          <span className="text-sm font-semibold font-mono text-zinc-200">
                            {cand.scores.payoff}/100
                          </span>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                            Context Clarity
                          </span>
                          <span className="text-sm font-semibold font-mono text-zinc-200">
                            {cand.scores.standaloneContext}/100
                          </span>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                            Duration Fit
                          </span>
                          <span className="text-sm font-semibold font-mono text-zinc-200">
                            {cand.scores.durationFitness || 85}/100
                          </span>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
                            Source Match
                          </span>
                          <span className="text-sm font-semibold font-mono text-zinc-200">
                            {cand.scores.sourceRelevance || 80}/100
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <div className="flex-1">
                          <span className="text-[11px] font-semibold text-zinc-400">
                            Selection Rationale:
                          </span>
                          <p className="text-zinc-300 mt-0.5 leading-relaxed">{cand.reason}</p>
                        </div>
                        {cand.topic && (
                          <div className="sm:w-1/3">
                            <span className="text-[11px] font-semibold text-zinc-400">
                              Detected Topic:
                            </span>
                            <p className="text-zinc-300 mt-0.5">{cand.topic}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason Modal/Drawer */}
                  {rejectionModalId === cand.id && (
                    <div className="px-5 py-4 bg-rose-950/20 border-t border-rose-900/40 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-rose-200 flex items-center gap-1.5">
                          <XCircle className="w-4 h-4 text-rose-400" />
                          Confirm Candidate Rejection
                        </span>
                        <button
                          onClick={() => setRejectionModalId(null)}
                          className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] text-zinc-300">
                          Rejection Reason (saved to Firestore candidate record):
                        </label>
                        <input
                          type="text"
                          value={rejectionCustomReason}
                          onChange={(e) => setRejectionCustomReason(e.target.value)}
                          placeholder="e.g., Hook lacks sufficient standalone context or pacing is too slow"
                          className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => setRejectionModalId(null)}
                          className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleConfirmReject(cand.id)}
                          className="px-3 py-1.5 rounded text-xs bg-rose-700 hover:bg-rose-600 text-white font-medium cursor-pointer"
                        >
                          Confirm Rejection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attach Authorized Media Modal */}
      {attachMediaModalCandidate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-100">Attach Authorized Moving Media</h3>
              </div>
              <button
                onClick={() => setAttachMediaModalCandidate(null)}
                className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-zinc-300 space-y-2">
              <p>
                Candidate:{' '}
                <strong className="text-zinc-100">{attachMediaModalCandidate.hook}</strong>
              </p>
              <p className="text-[11px] text-zinc-400">
                Timestamps: {attachMediaModalCandidate.startTime}s – {attachMediaModalCandidate.endTime}s ({attachMediaModalCandidate.duration}s duration).
                Media will be validated with ffprobe for non-zero dimensions, supported codecs, and real frame progression.
              </p>
            </div>

            {attachError && (
              <div className="p-3 rounded-md bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{attachError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1.5">
                  Source Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAttachSourceType('AUTHORIZED_DIRECT_URL')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                      attachSourceType === 'AUTHORIZED_DIRECT_URL'
                        ? 'border-indigo-600 bg-indigo-950/40 text-indigo-200'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-semibold text-xs">Direct Stream / URL</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">HTTPS direct MP4/stream</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAttachSourceType('AUTHORIZED_STORAGE')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                      attachSourceType === 'AUTHORIZED_STORAGE'
                        ? 'border-indigo-600 bg-indigo-950/40 text-indigo-200'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-semibold text-xs">Authorized Storage</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Local path or storage key</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  {attachSourceType === 'AUTHORIZED_DIRECT_URL'
                    ? 'Direct Moving Media URL (HTTPS)'
                    : 'Storage Reference / File Path'}
                </label>
                <input
                  type="text"
                  value={attachMediaUrl}
                  onChange={(e) => setAttachMediaUrl(e.target.value)}
                  placeholder={
                    attachSourceType === 'AUTHORIZED_DIRECT_URL'
                      ? 'https://example.com/authorized-content.mp4'
                      : '/public/dev-media/authorized_sample.mp4'
                  }
                  className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Content Identifier (Optional)
                </label>
                <input
                  type="text"
                  value={attachContentId}
                  onChange={(e) => setAttachContentId(e.target.value)}
                  placeholder="e.g. partner_feed_9921"
                  className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setAttachMediaModalCandidate(null)}
                disabled={isAttaching}
                className="px-4 py-2 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAttachMedia}
                disabled={isAttaching || !attachMediaUrl.trim()}
                className="px-4 py-2 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isAttaching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Validating Media...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Acquire & Validate Media</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Pipeline Test Modal */}
      {showPipelineTestModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  Authorized Media Acquisition & Validation Pipeline Test
                </h3>
              </div>
              <button
                onClick={() => setShowPipelineTestModal(false)}
                className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This technical verification tests genuine moving media acquisition, ffprobe stream analysis, frame progression checks, candidate timestamp bounds validation, renderer input handoff preparation, and temporary processing workspace cleanup using the isolated test media sample.
            </p>

            {isTestingPipeline ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                <span className="text-xs font-medium text-zinc-300">
                  Executing ffprobe validation & frame progression analysis...
                </span>
              </div>
            ) : pipelineTestResult ? (
              <div className="space-y-4">
                {/* Result Summary Banner */}
                <div
                  className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
                    pipelineTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {pipelineTestResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="font-semibold">
                      {pipelineTestResult.success
                        ? 'Authorized Media Pipeline Verification Passed'
                        : 'Pipeline Verification Encountered an Issue'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700">
                    {pipelineTestResult.success ? 'ALL CHECKS PASSED' : 'CHECK FAILED'}
                  </span>
                </div>

                {/* Step Breakdown */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Verification Steps & Diagnostics:
                  </span>
                  <div className="space-y-2">
                    {pipelineTestResult.stepResults.map((step, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-zinc-200">
                            {idx + 1}. {step.step}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                              step.status === 'passed'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {step.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                          {step.details}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Probe Metrics */}
                {pipelineTestResult.validatedMedia && (
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-2">
                    <span className="text-[11px] font-semibold text-zinc-300 block">
                      Validated Media Specifications:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                      <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px]">Container / Size</span>
                        <span className="text-zinc-200">
                          {(pipelineTestResult.validatedMedia.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                      <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px]">Dimensions</span>
                        <span className="text-zinc-200">
                          {pipelineTestResult.validatedMedia.width}x{pipelineTestResult.validatedMedia.height}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px]">Codecs</span>
                        <span className="text-zinc-200">
                          {pipelineTestResult.validatedMedia.videoCodec} / {pipelineTestResult.validatedMedia.audioCodec}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px]">Frames / Rate</span>
                        <span className="text-zinc-200">
                          {pipelineTestResult.validatedMedia.nbFrames} frames (~{Math.round(pipelineTestResult.validatedMedia.fps)} fps)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowPipelineTestModal(false)}
                className="px-4 py-2 text-xs font-medium rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
