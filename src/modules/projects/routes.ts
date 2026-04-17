import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authGuard, requireManager } from "../../app/auth.js";

const createProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  previewUrl: z.string().url().optional().nullable()
});

const projectParamsSchema = z.object({
  projectId: z.string().uuid()
});

export const registerProjectRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/projects",
    authGuard(async (request) => {
      requireManager(request);
      const body = createProjectSchema.parse(request.body);
      const project = await request.appContext.services.projectService.createProject({
        orgId: request.authUser!.orgId,
        actorUserId: request.authUser!.userId,
        ...body
      });

      return { data: project, meta: null, error: null };
    })
  );

  app.get(
    "/projects",
    authGuard(async (request) => {
      const projects = await request.appContext.services.projectService.listProjects(
        request.authUser!.userId,
        request.authUser!.orgId
      );
      return { data: projects, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const project = await request.appContext.services.projectService.getProject(
        params.projectId,
        request.authUser!.userId
      );
      return { data: project, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/members",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const result = await request.appContext.services.projectService.getMembers(
        params.projectId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );
};
