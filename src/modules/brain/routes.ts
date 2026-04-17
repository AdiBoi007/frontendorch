import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authGuard, requireManager } from "../../app/auth.js";

const projectParamsSchema = z.object({
  projectId: z.string().uuid()
});

export const registerBrainRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/projects/:projectId/brain/rebuild",
    authGuard(async (request) => {
      requireManager(request);
      const params = projectParamsSchema.parse(request.params);
      const result = await request.appContext.services.brainService.rebuild(
        params.projectId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/brain/current",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const result = await request.appContext.services.brainService.getCurrentBrain(
        params.projectId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/brain/versions",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const result = await request.appContext.services.brainService.getBrainVersions(
        params.projectId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/brain/graph/current",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const result = await request.appContext.services.brainService.getCurrentGraph(
        params.projectId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );
};
