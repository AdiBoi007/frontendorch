/**
 * Socrates API routes.
 *
 * POST   /v1/projects/:projectId/socrates/sessions
 * PATCH  /v1/projects/:projectId/socrates/sessions/:sessionId/context
 * GET    /v1/projects/:projectId/socrates/sessions/:sessionId/suggestions
 * POST   /v1/projects/:projectId/socrates/sessions/:sessionId/messages/stream
 * GET    /v1/projects/:projectId/socrates/sessions/:sessionId/messages
 */

import type { FastifyPluginAsync } from "fastify";
import { authGuard } from "../../app/auth.js";
import {
  createSessionBodySchema,
  patchContextBodySchema,
  projectParamsSchema,
  sessionParamsSchema,
  streamMessageBodySchema,
} from "./schemas.js";

export const registerSocratesRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/projects/:projectId/socrates/sessions
  app.post(
    "/projects/:projectId/socrates/sessions",
    authGuard(async (request) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = createSessionBodySchema.parse(request.body);
      const session = await request.appContext.services.socratesService.createSession(
        projectId,
        request.authUser!.userId,
        body
      );
      return { data: session, meta: null, error: null };
    })
  );

  // PATCH /v1/projects/:projectId/socrates/sessions/:sessionId/context
  app.patch(
    "/projects/:projectId/socrates/sessions/:sessionId/context",
    authGuard(async (request) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
      const body = patchContextBodySchema.parse(request.body);
      const session = await request.appContext.services.socratesService.patchContext(
        projectId,
        sessionId,
        request.authUser!.userId,
        body
      );
      return { data: session, meta: null, error: null };
    })
  );

  // GET /v1/projects/:projectId/socrates/sessions/:sessionId/suggestions
  app.get(
    "/projects/:projectId/socrates/sessions/:sessionId/suggestions",
    authGuard(async (request) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
      const result = await request.appContext.services.socratesService.getSuggestions(
        projectId,
        sessionId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );

  // POST /v1/projects/:projectId/socrates/sessions/:sessionId/messages/stream
  // SSE endpoint — does NOT follow the standard JSON envelope.
  // Sends SSE events: message_created | delta | done | error
  app.post(
    "/projects/:projectId/socrates/sessions/:sessionId/messages/stream",
    authGuard(async (request, reply) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
      const { content } = streamMessageBodySchema.parse(request.body);

      // SocratesService manages the SSE lifecycle and reply.raw directly.
      await request.appContext.services.socratesService.streamAnswer(
        projectId,
        sessionId,
        request.authUser!.userId,
        content,
        reply
      );

      // Return undefined — reply is handled inside streamAnswer.
      return undefined;
    })
  );

  // GET /v1/projects/:projectId/socrates/sessions/:sessionId/messages
  app.get(
    "/projects/:projectId/socrates/sessions/:sessionId/messages",
    authGuard(async (request) => {
      const { projectId, sessionId } = sessionParamsSchema.parse(request.params);
      const messages = await request.appContext.services.socratesService.getHistory(
        projectId,
        sessionId,
        request.authUser!.userId
      );
      return { data: messages, meta: null, error: null };
    })
  );
};
