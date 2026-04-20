import { AppError } from "../../../app/errors.js";
import type { CommunicationProviderAdapter } from "./provider.interface.js";

export class SlackProvider implements CommunicationProviderAdapter {
  readonly provider = "slack" as const;
  async connect(): Promise<never> {
    throw new AppError(501, "Slack connector is not implemented in communication layer C1", "connector_not_implemented");
  }
  async sync(): Promise<never> {
    throw new AppError(501, "Slack sync is not implemented in communication layer C1", "connector_not_implemented");
  }
}
