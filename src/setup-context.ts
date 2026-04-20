import type { Logger } from "pino";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "./config/env.js";
import type { EmbeddingProvider, GenerationProvider, TranscriptionProvider } from "./lib/ai/provider.js";
import { BullMqDispatcher, InlineJobDispatcher } from "./lib/jobs/queue.js";
import type { TelemetryService } from "./lib/observability/telemetry.js";
import type { StorageDriver } from "./lib/storage/types.js";
import { AuditService } from "./modules/audit/service.js";
import { AuthService } from "./modules/auth/service.js";
import { BrainService } from "./modules/brain/service.js";
import { ChangeProposalService } from "./modules/changes/service.js";
import { DashboardService } from "./modules/dashboard/service.js";
import { DocumentService } from "./modules/documents/service.js";
import { CommunicationsService } from "./modules/communications/communications.service.js";
import { ProjectService } from "./modules/projects/service.js";
import { SocratesService } from "./modules/socrates/service.js";
import type { AppContext } from "./types/index.js";

export function buildContext(input: {
  env: AppEnv;
  prisma: PrismaClient;
  logger: Logger;
  storage: StorageDriver;
  generationProvider: GenerationProvider;
  embeddingProvider: EmbeddingProvider;
  transcriptionProvider: TranscriptionProvider;
  telemetry: TelemetryService;
}): AppContext {
  const jobs =
    input.env.QUEUE_MODE === "inline"
      ? new InlineJobDispatcher({})
      : new BullMqDispatcher(input.env.REDIS_URL, `${input.env.QUEUE_PREFIX}-jobs`);
  const auditService = new AuditService(input.prisma);
  const projectService = new ProjectService(input.prisma, auditService, jobs);

  const brainService = new BrainService(input.prisma, input.generationProvider, jobs, projectService, auditService);
  const documentService = new DocumentService(
    input.prisma,
    input.storage,
    jobs,
    input.embeddingProvider,
    input.transcriptionProvider,
    projectService,
    auditService,
    input.telemetry
  );
  const changeProposalService = new ChangeProposalService(
    input.prisma,
    jobs,
    projectService,
    brainService,
    auditService
  );

  const socratesService = new SocratesService(
    input.prisma,
    input.env,
    input.generationProvider,
    input.embeddingProvider,
    projectService,
    auditService
  );
  const dashboardService = new DashboardService(input.prisma, projectService, auditService, input.telemetry);
  const communicationsService = new CommunicationsService(
    input.prisma,
    projectService,
    auditService,
    jobs,
    input.embeddingProvider,
    input.telemetry
  );

  const services = {
    auditService,
    authService: new AuthService(input.prisma, input.env, auditService),
    projectService,
    documentService,
    brainService,
    changeProposalService,
    socratesService,
    dashboardService,
    communicationsService
  };

  if (jobs instanceof InlineJobDispatcher) {
    jobs.handlers = {
      parse_document: async (payload) =>
        void (await services.documentService.processDocumentVersion(
          (payload as { documentVersionId: string; parseRevision: number }).documentVersionId,
          (payload as { documentVersionId: string; parseRevision: number }).parseRevision
        )),
      chunk_document: async (payload) =>
        void (await services.documentService.chunkDocumentVersion(
          (payload as { documentVersionId: string; parseRevision: number }).documentVersionId,
          (payload as { documentVersionId: string; parseRevision: number }).parseRevision
        )),
      embed_document_chunks: async (payload) =>
        void (await services.documentService.embedDocumentChunks(
          (payload as { documentVersionId: string; parseRevision: number }).documentVersionId,
          (payload as { documentVersionId: string; parseRevision: number }).parseRevision
        )),
      generate_source_package: async (payload) => {
        await services.brainService.generateSourcePackage((payload as { projectId: string }).projectId);
      },
      generate_clarified_brief: async (payload) => {
        await services.brainService.generateClarifiedBrief((payload as { projectId: string }).projectId);
      },
      generate_brain_graph: async (payload) => {
        await services.brainService.generateBrainGraph((payload as { projectId: string }).projectId);
      },
      generate_product_brain: async (payload) => {
        await services.brainService.generateProductBrain((payload as { projectId: string }).projectId);
      },
      apply_accepted_change: async (payload) => {
        await services.changeProposalService.applyAcceptedProposal(
          (payload as { projectId: string; proposalId: string }).projectId,
          (payload as { projectId: string; proposalId: string }).proposalId
        );
      },
      precompute_socrates_suggestions: async (payload) => {
        const { projectId, sessionId } = payload as { projectId: string; sessionId: string };
        await services.socratesService.precomputeSuggestions(projectId, sessionId);
      },
      refresh_dashboard_snapshot: async (payload) => {
        await services.dashboardService.refreshSnapshotJob(
          payload as { scope: "general" | "project"; orgId: string; projectId?: string | null; reason?: string }
        );
      },
      sync_communication_connector: async (payload) => {
        await services.communicationsService.sync.runSyncJob(
          payload as {
            connectorId: string;
            projectId: string;
            syncType: "manual" | "webhook" | "backfill" | "incremental";
            syncRunId: string;
            idempotencyKey?: string;
          }
        );
      },
      index_communication_message: async (payload) => {
        await services.communicationsService.indexing.runIndexJob(
          payload as { messageId: string; idempotencyKey?: string }
        );
      }
    };
  }

  return {
    ...input,
    jobs,
    services
  };
}
