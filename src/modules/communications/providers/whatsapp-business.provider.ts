import { AppError } from "../../../app/errors.js";
import type { CommunicationProviderAdapter } from "./provider.interface.js";

export class WhatsAppBusinessProvider implements CommunicationProviderAdapter {
  readonly provider = "whatsapp_business" as const;
  async connect(): Promise<never> {
    throw new AppError(501, "WhatsApp Business connector is not implemented in communication layer C3", "connector_not_implemented");
  }
  async sync(): Promise<never> {
    throw new AppError(501, "WhatsApp Business sync is not implemented in communication layer C3", "connector_not_implemented");
  }
}
