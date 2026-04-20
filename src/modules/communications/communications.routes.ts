import type { FastifyPluginAsync } from "fastify";
import { authGuard } from "../../app/auth.js";
import {
  connectorListQuerySchema,
  connectorParamsSchema,
  connectorPatchBodySchema,
  connectorSyncBodySchema,
  manualImportBodySchema,
  messageParamsSchema,
  projectParamsSchema,
  providerConnectParamsSchema,
  syncQuerySchema,
  threadListQuerySchema,
  threadParamsSchema,
  timelineQuerySchema
} from "./schemas.js";

export const registerCommunicationRoutes: FastifyPluginAsync = async (app) => {
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
