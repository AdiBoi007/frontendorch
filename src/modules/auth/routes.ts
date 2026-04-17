import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authGuard } from "../../app/auth.js";

const signupSchema = z.object({
  orgName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post("/signup", async (request) => {
    const body = signupSchema.parse(request.body);
    const result = await request.appContext.services.authService.signup(body);
    return {
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: {
          id: result.user.id,
          orgId: result.user.orgId,
          email: result.user.email,
          displayName: result.user.displayName,
          globalRole: result.user.globalRole,
          workspaceRoleDefault: result.user.workspaceRoleDefault
        }
      },
      meta: null,
      error: null
    };
  });

  app.post("/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const result = await request.appContext.services.authService.login(body);
    return {
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: {
          id: result.user.id,
          orgId: result.user.orgId,
          email: result.user.email,
          displayName: result.user.displayName,
          globalRole: result.user.globalRole,
          workspaceRoleDefault: result.user.workspaceRoleDefault
        }
      },
      meta: null,
      error: null
    };
  });

  app.post("/refresh", async (request) => {
    const body = refreshSchema.parse(request.body);
    const result = await request.appContext.services.authService.refresh(body.refreshToken);
    return { data: result, meta: null, error: null };
  });

  app.post(
    "/logout",
    authGuard(async (request) => {
      const body = refreshSchema.parse(request.body);
      await request.appContext.services.authService.logout(body.refreshToken);
      return { data: { ok: true }, meta: null, error: null };
    })
  );

  app.get(
    "/me",
    authGuard(async (request) => {
      const user = await request.appContext.services.authService.getMe(request.authUser!.userId);
      return { data: user, meta: null, error: null };
    })
  );
};
