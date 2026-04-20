import { getEnv } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import { createEmbeddingProvider, createGenerationProvider, createTranscriptionProvider } from "./lib/ai/index.js";
import { registerWorker } from "./lib/jobs/queue.js";
import { JobNames } from "./lib/jobs/types.js";
import { createLogger } from "./lib/logging/logger.js";
import { TelemetryService } from "./lib/observability/telemetry.js";
import { createStorageDriver } from "./lib/storage/index.js";
import { buildContext } from "./setup-context.js";

const env = getEnv();
const prisma = createPrismaClient();
const logger = createLogger(env.LOG_LEVEL);
const telemetry = new TelemetryService();

const context = buildContext({
  env,
  prisma,
  logger,
  storage: createStorageDriver(env),
  generationProvider: createGenerationProvider(env),
  embeddingProvider: createEmbeddingProvider(env),
  transcriptionProvider: createTranscriptionProvider(env),
  telemetry
});

registerWorker(context, `${env.QUEUE_PREFIX}-jobs`, {
  [JobNames.parseDocument]: async (payload) => {
    const { documentVersionId, parseRevision } = payload as { documentVersionId: string; parseRevision: number };
    await context.services.documentService.processDocumentVersion(documentVersionId, parseRevision);
  },
  [JobNames.chunkDocument]: async (payload) => {
    const { documentVersionId, parseRevision } = payload as { documentVersionId: string; parseRevision: number };
    await context.services.documentService.chunkDocumentVersion(documentVersionId, parseRevision);
  },
  [JobNames.embedDocumentChunks]: async (payload) => {
    const { documentVersionId, parseRevision } = payload as { documentVersionId: string; parseRevision: number };
    await context.services.documentService.embedDocumentChunks(documentVersionId, parseRevision);
  },
  [JobNames.generateSourcePackage]: async (payload) => {
    const { projectId } = payload as { projectId: string };
    await context.services.brainService.generateSourcePackage(projectId);
  },
  [JobNames.generateClarifiedBrief]: async (payload) => {
    const { projectId } = payload as { projectId: string };
    await context.services.brainService.generateClarifiedBrief(projectId);
  },
  [JobNames.generateBrainGraph]: async (payload) => {
    const { projectId } = payload as { projectId: string };
    await context.services.brainService.generateBrainGraph(projectId);
  },
  [JobNames.generateProductBrain]: async (payload) => {
    const { projectId } = payload as { projectId: string };
    await context.services.brainService.generateProductBrain(projectId);
  },
  [JobNames.applyAcceptedChange]: async (payload) => {
    const { projectId, proposalId } = payload as { projectId: string; proposalId: string };
    await context.services.changeProposalService.applyAcceptedProposal(projectId, proposalId);
  },
  [JobNames.precomputeSocratesSuggestions]: async (payload) => {
    const { projectId, sessionId } = payload as { projectId: string; sessionId: string };
    await context.services.socratesService.precomputeSuggestions(projectId, sessionId);
  },
  [JobNames.refreshDashboardSnapshot]: async (payload) => {
    await context.services.dashboardService.refreshSnapshotJob(
      payload as { scope: "general" | "project"; orgId: string; projectId?: string | null; reason?: string }
    );
  },
  [JobNames.syncCommunicationConnector]: async (payload) => {
    await context.services.communicationsService.sync.runSyncJob(
      payload as {
        connectorId: string;
        projectId: string;
        syncType: "manual" | "webhook" | "backfill" | "incremental";
        syncRunId: string;
        idempotencyKey?: string;
      }
    );
  },
  [JobNames.indexCommunicationMessage]: async (payload) => {
    await context.services.communicationsService.indexing.runIndexJob(
      payload as { messageId: string; idempotencyKey?: string }
    );
  }
});

logger.info({ queuePrefix: env.QUEUE_PREFIX }, "worker_started");
