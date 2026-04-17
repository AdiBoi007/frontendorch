import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";

export const requestContextPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    request.requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
    request.appContext = fastify.appContext;
  });
});
