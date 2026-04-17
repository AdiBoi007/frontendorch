import type { JwtUser } from "../lib/auth/jwt.js";
import type { AppContext } from "../types/index.js";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    authUser?: JwtUser;
    appContext: AppContext;
  }
}
