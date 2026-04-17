import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import type { AppContext } from "../types/index.js";
import { toAppError } from "./errors.js";
import { requestContextPlugin } from "./context.js";
import { registerAuthRoutes } from "../modules/auth/routes.js";
import { registerProjectRoutes } from "../modules/projects/routes.js";
import { registerDocumentRoutes } from "../modules/documents/routes.js";
import { registerBrainRoutes } from "../modules/brain/routes.js";
import { registerChangeProposalRoutes } from "../modules/changes/routes.js";
import { registerSocratesRoutes } from "../modules/socrates/routes.js";

declare module "fastify" {
  interface FastifyInstance {
    appContext: AppContext;
  }
}

export async function buildApp(context: AppContext) {
  const app = Fastify({
    logger: false,
    loggerInstance: context.logger
  });

  app.decorate("appContext", context);

  await app.register(cors, {
    origin: context.env.CORS_ALLOWED_ORIGINS.split(",").map((value) => value.trim())
  });
  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024
    }
  });
  await app.register(jwt, {
    secret: context.env.JWT_ACCESS_SECRET
  });
  await app.register(requestContextPlugin);

  app.get("/health", async () => ({
    ok: true,
    timestamp: new Date().toISOString()
  }));

  await app.register(registerAuthRoutes, { prefix: "/v1/auth" });
  await app.register(registerProjectRoutes, { prefix: "/v1" });
  await app.register(registerDocumentRoutes, { prefix: "/v1" });
  await app.register(registerBrainRoutes, { prefix: "/v1" });
  await app.register(registerChangeProposalRoutes, { prefix: "/v1" });
  await app.register(registerSocratesRoutes, { prefix: "/v1" });

  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error);
    context.logger.error(
      {
        err: error,
        method: request.method,
        url: request.url,
        requestId: request.id,
        errorCode: appError.code
      },
      "request_failed"
    );
    void reply.code(appError.statusCode).send({
      data: null,
      meta: null,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details ?? null
      }
    });
  });

  return app;
}
