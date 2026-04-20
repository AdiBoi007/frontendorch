import type { CommunicationProvider } from "@prisma/client";
import { AppError } from "../../app/errors.js";

type CredentialRecord = {
  provider: CommunicationProvider;
  value: Record<string, unknown> | null;
  revokedAt: Date | null;
};

export class CredentialVault {
  private readonly records = new Map<string, CredentialRecord>();

  async putCredential(input: {
    provider: CommunicationProvider;
    connectorId: string;
    credential: Record<string, unknown> | null;
  }) {
    if (input.provider !== "manual_import") {
      throw new AppError(
        501,
        "Live provider credential storage is intentionally disabled in C1",
        "credential_storage_not_implemented"
      );
    }

    this.records.set(input.connectorId, {
      provider: input.provider,
      value: input.credential ?? null,
      revokedAt: null
    });

    return { ref: `manual:${input.connectorId}` };
  }

  async getCredential(provider: CommunicationProvider, connectorId: string) {
    if (provider !== "manual_import") {
      throw new AppError(
        501,
        "Live provider credential retrieval is intentionally disabled in C1",
        "credential_storage_not_implemented"
      );
    }

    return this.records.get(connectorId)?.value ?? null;
  }

  async revokeCredential(provider: CommunicationProvider, connectorId: string) {
    if (provider !== "manual_import") {
      throw new AppError(
        501,
        "Live provider credential revocation is intentionally disabled in C1",
        "credential_storage_not_implemented"
      );
    }

    const record = this.records.get(connectorId);
    if (record) {
      record.revokedAt = new Date();
      this.records.set(connectorId, record);
    }
  }
}
