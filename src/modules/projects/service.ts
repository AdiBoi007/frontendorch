import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import { toSlug } from "../../lib/utils/slug.js";
import { AuditService } from "../audit/service.js";

export class ProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {}

  async createProject(input: {
    orgId: string;
    actorUserId: string;
    name: string;
    description?: string | null;
    previewUrl?: string | null;
  }) {
    const slug = await this.generateUniqueProjectSlug(input.orgId, input.name);
    const project = await this.prisma.project.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        slug,
        description: input.description ?? null,
        previewUrl: input.previewUrl ?? null,
        status: "active",
        createdBy: input.actorUserId,
        members: {
          create: {
            userId: input.actorUserId,
            projectRole: "manager"
          }
        }
      }
    });

    await this.auditService.record({
      orgId: input.orgId,
      projectId: project.id,
      actorUserId: input.actorUserId,
      eventType: "project_created",
      entityType: "project",
      entityId: project.id,
      payload: { name: project.name }
    });

    return project;
  }

  async listProjects(userId: string, orgId: string) {
    return this.prisma.project.findMany({
      where: {
        orgId,
        members: {
          some: {
            userId,
            isActive: true
          }
        }
      },
      include: {
        members: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async getProject(projectId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);
    return this.prisma.project.findUniqueOrThrow({
      where: { id: projectId }
    });
  }

  async getMembers(projectId: string, userId: string) {
    await this.ensureProjectAccess(projectId, userId);
    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        isActive: true
      },
      include: {
        user: true
      }
    });

    const headcount = members.length;
    const roleSummary = members.reduce<Record<string, number>>((accumulator, member) => {
      accumulator[member.projectRole] = (accumulator[member.projectRole] ?? 0) + 1;
      return accumulator;
    }, {});

    return {
      members,
      summary: {
        headcount,
        roleSummary
      }
    };
  }

  async ensureProjectAccess(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        isActive: true
      }
    });

    if (!member) {
      throw new AppError(403, "Project access denied", "project_access_denied");
    }

    return member;
  }

  async ensureProjectManager(projectId: string, userId: string) {
    const member = await this.ensureProjectAccess(projectId, userId);
    if (member.projectRole !== "manager") {
      throw new AppError(403, "Manager access required", "manager_access_required");
    }

    return member;
  }

  private async generateUniqueProjectSlug(orgId: string, name: string) {
    const baseSlug = toSlug(name);
    let candidate = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await this.prisma.project.findFirst({
        where: {
          orgId,
          slug: candidate
        },
        select: {
          id: true
        }
      });

      if (!existing) {
        return candidate;
      }

      suffix += 1;
      candidate = `${baseSlug}-${suffix}`;
    }
  }
}
