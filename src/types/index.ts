import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import type { AppEnv } from "../config/env.js";
import type { EmbeddingProvider, GenerationProvider } from "../lib/ai/provider.js";
import type { TranscriptionProvider } from "../lib/ai/provider.js";
import type { JobDispatcher } from "../lib/jobs/types.js";
import type { TelemetryService } from "../lib/observability/telemetry.js";
import type { StorageDriver } from "../lib/storage/types.js";
import type { AuditService } from "../modules/audit/service.js";
import type { AuthService } from "../modules/auth/service.js";
import type { BrainService } from "../modules/brain/service.js";
import type { ChangeProposalService } from "../modules/changes/service.js";
import type { DocumentService } from "../modules/documents/service.js";
import type { ProjectService } from "../modules/projects/service.js";
import type { SocratesService } from "../modules/socrates/service.js";

export interface AppServices {
  authService: AuthService;
  projectService: ProjectService;
  documentService: DocumentService;
  brainService: BrainService;
  changeProposalService: ChangeProposalService;
  auditService: AuditService;
  socratesService: SocratesService;
}

export interface AppContext {
  env: AppEnv;
  logger: Logger;
  prisma: PrismaClient;
  storage: StorageDriver;
  generationProvider: GenerationProvider;
  embeddingProvider: EmbeddingProvider;
  transcriptionProvider: TranscriptionProvider;
  jobs: JobDispatcher;
  telemetry: TelemetryService;
  services: AppServices;
}
