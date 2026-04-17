import { createHash } from "node:crypto";

export interface JwtUser {
  userId: string;
  orgId: string;
  workspaceRoleDefault: "manager" | "dev" | "client";
  globalRole: "owner" | "admin" | "member";
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
