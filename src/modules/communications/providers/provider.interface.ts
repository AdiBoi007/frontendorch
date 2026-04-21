import type {
  CommunicationConnector,
  CommunicationProvider,
  CommunicationSyncType
} from "@prisma/client";
import type { NormalizedCommunicationBatch } from "../../../lib/communications/provider-normalized-types.js";

export interface ProviderConnectResult {
  mode: "connected" | "oauth_pending";
  status: "pending_auth" | "connected";
  redirectUrl?: string;
  accountLabel?: string;
  config?: Record<string, unknown>;
}

export interface ProviderCallbackResult {
  accountLabel: string;
  credential: Record<string, unknown>;
  providerCursor?: Record<string, unknown> | null;
  configPatch?: Record<string, unknown>;
}

export interface ProviderSyncResult {
  queued: boolean;
  batches?: NormalizedCommunicationBatch[];
  cursorAfter?: Record<string, unknown> | null;
  summary?: Record<string, unknown>;
  deletedProviderMessageIds?: string[];
  updatedCredential?: Record<string, unknown> | null;
}

export interface ProviderWebhookVerificationResult {
  handledImmediately?: { statusCode?: number; body: unknown };
  providerEventId?: string;
  eventType?: string;
  connectorIds?: string[];
  jobPayload?: Record<string, unknown>;
  projectIdHints?: string[];
}

export interface CommunicationProviderAdapter {
  readonly provider: CommunicationProvider;
  connect(input: {
    projectId: string;
    actorUserId: string;
    oauthState?: string;
  }): Promise<ProviderConnectResult>;
  handleOAuthCallback?(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderCallbackResult>;
  sync(input: {
    projectId: string;
    connector: CommunicationConnector;
    credential: Record<string, unknown> | null;
    syncType: CommunicationSyncType;
    webhookPayload?: Record<string, unknown>;
    batchSize: number;
    maxBackfillDays: number;
  }): Promise<ProviderSyncResult>;
  verifyWebhook?(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    body: unknown;
    connectors: CommunicationConnector[];
  }): Promise<ProviderWebhookVerificationResult>;
  revoke?(input: {
    connector: CommunicationConnector;
    credential: Record<string, unknown> | null;
  }): Promise<void>;
  normalizeImport?(input: unknown): Promise<NormalizedCommunicationBatch>;
}
