import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";

export const requestContextPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    request.requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
    request.requestStartedAt = process.hrtime.bigint();
    request.appContext = fastify.appContext;
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const startedAt = request.requestStartedAt;
    if (!startedAt) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = request.routeOptions.url ?? request.url;
    request.appContext.telemetry.increment("orchestra_http_requests_total", {
      method: request.method,
      route,
      status_code: reply.statusCode
    });
    request.appContext.telemetry.observeDuration("orchestra_http_request_duration_ms", durationMs, {
      method: request.method,
      route,
      status_code: reply.statusCode
    });

    request.appContext.logger.info(
      {
        requestId: request.requestId,
        method: request.method,
        route,
        statusCode: reply.statusCode,
        durationMs: Number(durationMs.toFixed(2))
      },
      "http_request_completed"
    );
  });
});
