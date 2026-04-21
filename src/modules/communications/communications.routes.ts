import type { FastifyPluginAsync } from "fastify";
import { authGuard } from "../../app/auth.js";
import {
  connectorListQuerySchema,
  connectorParamsSchema,
  connectorPatchBodySchema,
  connectorSyncBodySchema,
  manualImportBodySchema,
  messageInsightListQuerySchema,
  messageInsightParamsSchema,
  messageParamsSchema,
  oauthCallbackQuerySchema,
  projectParamsSchema,
  providerConnectParamsSchema,
  syncQuerySchema,
  threadListQuerySchema,
  threadParamsSchema,
  timelineQuerySchema
} from "./schemas.js";

export const registerCommunicationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/oauth/slack/callback", async (request) => {
    const query = oauthCallbackQuerySchema.parse(request.query);
    const data = await request.appContext.services.communicationsService.connectors.handleOAuthCallback("slack", query);
    return { data, meta: null, error: null };
  });

  app.get("/oauth/google/callback", async (request) => {
    const query = oauthCallbackQuerySchema.parse(request.query);
    const data = await request.appContext.services.communicationsService.connectors.handleOAuthCallback("gmail", query);
    return { data, meta: null, error: null };
  });

  app.post("/webhooks/slack", async (request, reply) => {
    const result = await request.appContext.services.communicationsService.connectors.handleWebhook("slack", {
      headers: request.headers,
      rawBody: request.rawBody ?? JSON.stringify(request.body ?? {}),
      body: request.body
    });
    if (result.statusCode) {
      reply.code(result.statusCode);
    }
    return result.body;
  });

  app.get(
    "/projects/:projectId/connectors",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const query = connectorListQuerySchema.parse(request.query);
      const data = await request.appContext.services.communicationsService.connectors.list(
        params.projectId,
        request.authUser!.userId,
        query
      );
      return { data, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/connectors/:connectorId",
    authGuard(async (request) => {
      const params = connectorParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.connectors.get(
        params.projectId,
        params.connectorId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.patch(
    "/projects/:projectId/connectors/:connectorId",
    authGuard(async (request) => {
      const params = connectorParamsSchema.parse(request.params);
      const body = connectorPatchBodySchema.parse(request.body);
      const data = await request.appContext.services.communicationsService.connectors.update(
        params.projectId,
        params.connectorId,
        request.authUser!.userId,
        body
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/connectors/:provider/connect",
    authGuard(async (request) => {
      const params = providerConnectParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.connectors.connect(
        params.projectId,
        params.provider,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/connectors/:connectorId/sync",
    authGuard(async (request) => {
      const params = connectorParamsSchema.parse(request.params);
      const body = connectorSyncBodySchema.parse(request.body ?? {});
      const data = await request.appContext.services.communicationsService.sync.queueSync(
        params.projectId,
        params.connectorId,
        request.authUser!.userId,
        body.syncType
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/connectors/:connectorId/revoke",
    authGuard(async (request) => {
      const params = connectorParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.connectors.revoke(
        params.projectId,
        params.connectorId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/connectors/:connectorId/sync-runs",
    authGuard(async (request) => {
      const params = connectorParamsSchema.parse(request.params);
      const query = syncQuerySchema.parse(request.query);
      const data = await request.appContext.services.communicationsService.connectors.listSyncRuns(
        params.projectId,
        params.connectorId,
        request.authUser!.userId,
        query
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/communications/import",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const body = manualImportBodySchema.parse(request.body);
      const data = await request.appContext.services.communicationsService.importManualBatch({
        projectId: params.projectId,
        actorUserId: request.authUser!.userId,
        accountLabel: body.accountLabel,
        batch: {
          provider: "manual_import",
          syncRunId: null,
          threads: [
            {
              providerThreadId: body.thread.providerThreadId,
              subject: body.thread.subject ?? null,
              participants: body.thread.participants,
              startedAt: body.thread.startedAt ?? null,
              threadUrl: body.thread.threadUrl ?? null,
              rawMetadata: body.thread.rawMetadata ?? null
            }
          ],
          messages: body.messages.map((message) => ({
            providerMessageId: message.providerMessageId,
            senderLabel: message.senderLabel,
            senderExternalRef: message.senderExternalRef ?? null,
            senderEmail: message.senderEmail ?? null,
            sentAt: message.sentAt,
            bodyText: message.bodyText,
            bodyHtml: message.bodyHtml ?? null,
            messageType: message.messageType,
            providerPermalink: message.providerPermalink ?? null,
            replyToProviderMessageId: message.replyToProviderMessageId ?? null,
            rawMetadata: message.rawMetadata ?? null,
            attachments: message.attachments
          }))
        }
      });
      return { data, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/message-insights",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const query = messageInsightListQuerySchema.parse(request.query);
      const result = await request.appContext.services.communicationsService.messageInsights.list(
        params.projectId,
        request.authUser!.userId,
        query
      );
      return { data: result.items, meta: result.meta, error: null };
    })
  );

  app.get(
    "/projects/:projectId/message-insights/:insightId",
    authGuard(async (request) => {
      const params = messageInsightParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.messageInsights.get(
        params.projectId,
        params.insightId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/message-insights/:insightId/ignore",
    authGuard(async (request) => {
      const params = messageInsightParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.messageInsights.ignore(
        params.projectId,
        params.insightId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/message-insights/:insightId/create-proposal",
    authGuard(async (request) => {
      const params = messageInsightParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.messageInsights.createProposal(
        params.projectId,
        params.insightId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/messages/:messageId/classify",
    authGuard(async (request) => {
      const params = messageParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.messageInsights.classifyMessage(
        params.projectId,
        params.messageId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/threads/:threadId/classify",
    authGuard(async (request) => {
      const params = threadParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.threadInsights.classifyThread(
        params.projectId,
        params.threadId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/communication-review",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.messageInsights.getReviewQueue(
        params.projectId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/communications/timeline",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const query = timelineQuerySchema.parse(request.query);
      const result = await request.appContext.services.communicationsService.timeline.getTimeline(
        params.projectId,
        request.authUser!.userId,
        query
      );
      return { data: result.items, meta: result.meta, error: null };
    })
  );

  app.get(
    "/projects/:projectId/threads",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const query = threadListQuerySchema.parse(request.query);
      const result = await request.appContext.services.communicationsService.timeline.listThreads(
        params.projectId,
        request.authUser!.userId,
        query
      );
      return { data: result.items, meta: result.meta, error: null };
    })
  );

  app.get(
    "/projects/:projectId/threads/:threadId",
    authGuard(async (request) => {
      const params = threadParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.timeline.getThread(
        params.projectId,
        params.threadId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/messages/:messageId",
    authGuard(async (request) => {
      const params = messageParamsSchema.parse(request.params);
      const data = await request.appContext.services.communicationsService.timeline.getMessage(
        params.projectId,
        params.messageId,
        request.authUser!.userId
      );
      return { data, meta: null, error: null };
    })
  );
};
