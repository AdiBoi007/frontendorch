import type { FastifyPluginAsync } from "fastify";
import { authGuard, requireManager } from "../../app/auth.js";
import {
  generalDashboardQuerySchema,
  projectDashboardQuerySchema,
  projectParamsSchema
} from "./schemas.js";

export const registerDashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/dashboard/general",
    authGuard(async (request) => {
      requireManager(request);
      const query = generalDashboardQuerySchema.parse(request.query);
      const result = await request.appContext.services.dashboardService.getGeneralDashboard({
        orgId: request.authUser!.orgId,
        actorUserId: request.authUser!.userId,
        forceRefresh: query.forceRefresh
      });
      return { data: result, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/dashboard",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const query = projectDashboardQuerySchema.parse(request.query);
      const result = await request.appContext.services.dashboardService.getProjectDashboard(
        params.projectId,
        request.authUser!.userId,
        { forceRefresh: query.forceRefresh }
      );
      return { data: result, meta: null, error: null };
    })
  );

  app.get(
    "/projects/:projectId/team-summary",
    authGuard(async (request) => {
      const params = projectParamsSchema.parse(request.params);
      const result = await request.appContext.services.dashboardService.getProjectTeamSummary(
        params.projectId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );

  app.post(
    "/projects/:projectId/dashboard/refresh",
    authGuard(async (request) => {
      requireManager(request);
      const params = projectParamsSchema.parse(request.params);
      const result = await request.appContext.services.dashboardService.refreshProjectDashboard(
        params.projectId,
        request.authUser!.userId
      );
      return { data: result, meta: null, error: null };
    })
  );
};
