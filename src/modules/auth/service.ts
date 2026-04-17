import jwt from "jsonwebtoken";
import type { PrismaClient, WorkspaceRoleDefault } from "@prisma/client";
import { AppError } from "../../app/errors.js";
import type { AppEnv } from "../../config/env.js";
import { hashToken, type JwtUser } from "../../lib/auth/jwt.js";
import { hashPassword, verifyPassword } from "../../lib/auth/password.js";
import { toSlug } from "../../lib/utils/slug.js";
import { AuditService } from "../audit/service.js";

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: AppEnv,
    private readonly auditService: AuditService
  ) {}

  async signup(input: {
    orgName: string;
    email: string;
    password: string;
    displayName: string;
  }) {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: input.email
      }
    });

    if (existing) {
      throw new AppError(409, "User already exists", "user_exists");
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: input.orgName,
        slug: toSlug(input.orgName)
      }
    });

    const passwordHash = await hashPassword(input.password, this.env.PASSWORD_HASH_COST);

    const user = await this.prisma.user.create({
      data: {
        orgId: organization.id,
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        globalRole: "owner",
        workspaceRoleDefault: "manager"
      }
    });

    await this.auditService.record({
      orgId: organization.id,
      actorUserId: user.id,
      eventType: "user_signed_up",
      entityType: "user",
      entityId: user.id,
      payload: { email: user.email }
    });

    const tokens = await this.issueTokens({
      userId: user.id,
      orgId: organization.id,
      workspaceRoleDefault: "manager",
      globalRole: "owner"
    });

    return {
      organization,
      user,
      ...tokens
    };
  }

  async login(input: { email: string; password: string }) {
    const users = await this.prisma.user.findMany({
      where: {
        email: input.email,
        isActive: true
      }
    });

    if (users.length !== 1) {
      throw new AppError(401, "Invalid credentials", "invalid_credentials");
    }

    const user = users[0];
    if (!user.passwordHash) {
      throw new AppError(401, "Invalid credentials", "invalid_credentials");
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "Invalid credentials", "invalid_credentials");
    }

    const tokens = await this.issueTokens({
      userId: user.id,
      orgId: user.orgId,
      workspaceRoleDefault: user.workspaceRoleDefault as WorkspaceRoleDefault,
      globalRole: user.globalRole
    });

    return { user, ...tokens };
  }

  async refresh(refreshToken: string) {
    const payload = jwt.verify(refreshToken, this.env.JWT_REFRESH_SECRET) as JwtUser;
    const tokenHash = hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null
      }
    });

    if (!record || record.expiresAt < new Date()) {
      throw new AppError(401, "Refresh token expired", "refresh_expired");
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: {
        revokedAt: new Date()
      }
    });

    return this.issueTokens(payload);
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() }
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError(404, "User not found", "user_not_found");
    }

    return user;
  }

  private async issueTokens(user: JwtUser) {
    const accessToken = jwt.sign(user, this.env.JWT_ACCESS_SECRET, {
      expiresIn: this.env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"]
    });
    const refreshToken = jwt.sign(user, this.env.JWT_REFRESH_SECRET, {
      expiresIn: this.env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"]
    });

    const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.userId,
        orgId: user.orgId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date((decoded?.exp ?? 0) * 1000)
      }
    });

    return { accessToken, refreshToken };
  }
}
