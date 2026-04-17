import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __orchestraPrisma__: PrismaClient | undefined;
}

export function createPrismaClient() {
  if (!global.__orchestraPrisma__) {
    global.__orchestraPrisma__ = new PrismaClient();
  }

  return global.__orchestraPrisma__;
}
