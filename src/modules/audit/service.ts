import type { PrismaClient } from "@prisma/client";

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: {
    orgId: string;
    eventType: string;
    entityType: string;
    entityId?: string | null;
    projectId?: string | null;
    actorUserId?: string | null;
    payload: unknown;
  }) {
    await this.prisma.auditEvent.create({
      data: {
        orgId: input.orgId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        projectId: input.projectId ?? null,
        actorUserId: input.actorUserId ?? null,
        payloadJson: input.payload as object
      }
    });
  }
}
