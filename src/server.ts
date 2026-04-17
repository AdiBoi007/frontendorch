import { getEnv } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import { createEmbeddingProvider, createGenerationProvider, createTranscriptionProvider } from "./lib/ai/index.js";
import { createStorageDriver } from "./lib/storage/index.js";
import { createLogger } from "./lib/logging/logger.js";
import { TelemetryService } from "./lib/observability/telemetry.js";
import { buildContext } from "./setup-context.js";
import { buildApp } from "./app/build-app.js";

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

const app = await buildApp(context);

await app.listen({
  port: env.PORT,
  host: env.HOST
});

logger.info({ port: env.PORT, host: env.HOST }, "server_started");
