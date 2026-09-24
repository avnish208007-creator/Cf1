import { SourceVideo, WorkspaceSettings, ChannelCandidate, MonitoredChannel } from '../../types';

export interface DiscoveryQuery {
  niche: string;
  subtopic?: string;
  angle: string;
  language: string;
  maxResults?: number;
}

export interface DiscoveryRejection {
  id?: string;
  title?: string;
  reason: string;
}

export interface DiscoveryResult {
  sources: SourceVideo[];
  totalDiscovered: number;
  totalAccepted: number;
  totalRejected: number;
  rejections?: DiscoveryRejection[];
  providerName: string;
  queryAnglesUsed: string[];
  channelsDiscovered?: number;
  channelsAdded?: number;
  newVideos?: number;
  duplicatesSkipped?: number;
  channels?: MonitoredChannel[];
}

export interface IDiscoveryProvider {
  readonly id: string;
  readonly name: string;
  readonly isConnected: boolean;
  discover(settings: WorkspaceSettings, existingExternalIds: Set<string>): Promise<DiscoveryResult>;
}
