import { AppError } from "../../../app/errors.js";
import type { CommunicationProviderAdapter } from "./provider.interface.js";

export class GmailProvider implements CommunicationProviderAdapter {
  readonly provider = "gmail" as const;
  async connect(): Promise<never> {
    throw new AppError(501, "Gmail connector is not implemented in communication layer C1", "connector_not_implemented");
  }
  async sync(): Promise<never> {
    throw new AppError(501, "Gmail sync is not implemented in communication layer C1", "connector_not_implemented");
  }
}
