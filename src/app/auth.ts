import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./errors.js";

export async function requireAuth(request: FastifyRequest) {
  await request.jwtVerify();
  request.authUser = request.user as typeof request.authUser;
}

export function requireWorkspaceRole(request: FastifyRequest, roles: Array<"manager" | "dev" | "client">) {
  const role = request.authUser?.workspaceRoleDefault;
  if (!role || !roles.includes(role)) {
    throw new AppError(403, "Forbidden", "forbidden");
  }
}

export function requireManager(request: FastifyRequest) {
  requireWorkspaceRole(request, ["manager"]);
}

export function authGuard(handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request);
    return handler(request, reply);
  };
}
