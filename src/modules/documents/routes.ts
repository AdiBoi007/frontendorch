import type { FastifyPluginAsync } from "fastify";
import { authGuard, requireManager } from "../../app/auth.js";
import {
  anchorParamsSchema,
  documentParamsSchema,
  multipartUploadMetadataSchema,
  pastedTextUploadSchema
} from "./schemas.js";

export const registerDocumentRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/projects/:projectId/documents/upload",
    authGuard(async (request) => {
      const projectId = documentParamsSchema.shape.projectId.parse((request.params as { projectId: string }).projectId);
      const contentType = request.headers["content-type"] ?? "";

      if (contentType.includes("application/json")) {
        const body = pastedTextUploadSchema.parse(request.body);
        const result = await request.appContext.services.documentService.uploadFile({
          projectId,
          actorUserId: request.authUser!.userId,
          kind: body.kind,
          title: body.title,
          visibility: body.visibility,
          sourceLabel: body.sourceLabel,
          fileName: `${body.title}.md`,
          contentType: "text/markdown",
          buffer: Buffer.from(body.pastedText, "utf8")
        });

        return { data: result, meta: null, error: null };
      }

      const file = await request.file();
      if (!file) {
        throw new Error("Missing file upload");
      }

      const fields = file.fields as Record<string, { value?: string }>;
      const metadata = multipartUploadMetadataSchema.parse({
        kind: fields.kind?.value ?? "other",
        title: fields.title?.value ?? file.filename,
        visibility: fields.visibility?.value ?? "internal",
        sourceLabel: fields.sourceLabel?.value
      });

      const result = await request.appContext.services.documentService.uploadFile({
        projectId,
        actorUserId: request.authUser!.userId,
        kind: metadata.kind,
        title: metadata.title,
        visibility: metadata.visibility,
        sourceLabel: metadata.sourceLabel,
        fileName: file.filename,
        contentType: file.mimetype,
        buffer: await file.toBuffer()
      });

      return { data: result, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/documents",
    authGuard(async (request) => {
      const projectId = documentParamsSchema.shape.projectId.parse((request.params as { projectId: string }).projectId);
      const documents = await request.appContext.services.documentService.listDocuments(
        projectId,
        request.authUser!.userId
      );
      return { data: documents, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/documents/:documentId",
    authGuard(async (request) => {
      const params = documentParamsSchema.parse(request.params);
      const document = await request.appContext.services.documentService.getDocument(
        params.projectId,
        params.documentId,
        request.authUser!.userId
      );
      return { data: document, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/documents/:documentId/view",
    authGuard(async (request) => {
      const params = documentParamsSchema.parse(request.params);
      const payload = await request.appContext.services.documentService.getViewerPayload(
        params.projectId,
        params.documentId,
        request.authUser!.userId
      );
      return { data: payload, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/documents/:documentId/anchors/:anchorId",
    authGuard(async (request) => {
      const params = anchorParamsSchema.parse(request.params);
      const payload = await request.appContext.services.documentService.getAnchor(
        params.projectId,
        params.documentId,
        params.anchorId,
        request.authUser!.userId
      );
      return { data: payload, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/documents/:documentId/reprocess",
    authGuard(async (request) => {
      requireManager(request);
      const params = documentParamsSchema.parse(request.params);
      const result = await request.appContext.services.documentService.reprocess(
        params.projectId,
        params.documentId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );
};
