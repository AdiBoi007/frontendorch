import { AppError } from "../../../app/errors.js";
import type { CommunicationProviderAdapter } from "./provider.interface.js";

export class OutlookProvider implements CommunicationProviderAdapter {
  readonly provider = "outlook" as const;
  async connect(): Promise<never> {
    throw new AppError(501, "Outlook connector is not implemented in communication layer C3", "connector_not_implemented");
  }
  async sync(): Promise<never> {
    throw new AppError(501, "Outlook sync is not implemented in communication layer C3", "connector_not_implemented");
  }
}
