import type { CommunicationProvider } from "@prisma/client";
import type { NormalizedCommunicationBatch } from "../../../lib/communications/provider-normalized-types.js";

export interface ProviderConnectResult {
  mode: "connected" | "oauth_pending";
  status: "pending_auth" | "connected";
  redirectUrl?: string;
  accountLabel?: string;
  config?: Record<string, unknown>;
}

export interface ProviderSyncResult {
  queued: boolean;
  summary?: Record<string, unknown>;
}

export interface CommunicationProviderAdapter {
  readonly provider: CommunicationProvider;
  connect(input: {
    projectId: string;
    actorUserId: string;
  }): Promise<ProviderConnectResult>;
  sync(input: {
    projectId: string;
    connectorId: string;
    syncType: "manual" | "webhook" | "backfill" | "incremental";
  }): Promise<ProviderSyncResult>;
  normalizeImport?(input: unknown): Promise<NormalizedCommunicationBatch>;
}
