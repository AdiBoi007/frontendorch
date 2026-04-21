import { AppError } from "../../../app/errors.js";
import type { CommunicationProviderAdapter } from "./provider.interface.js";

export class TeamsProvider implements CommunicationProviderAdapter {
  readonly provider = "microsoft_teams" as const;
  async connect(): Promise<never> {
    throw new AppError(501, "Microsoft Teams connector is not implemented in communication layer C3", "connector_not_implemented");
  }
  async sync(): Promise<never> {
    throw new AppError(501, "Microsoft Teams sync is not implemented in communication layer C3", "connector_not_implemented");
  }
}
