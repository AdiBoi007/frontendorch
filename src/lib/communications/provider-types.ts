export const communicationProviders = [
  "manual_import",
  "slack",
  "gmail",
  "outlook",
  "microsoft_teams",
  "whatsapp_business"
] as const;

export type CommunicationProviderName = (typeof communicationProviders)[number];

export const implementedCommunicationProviders = [
  "manual_import",
  "slack",
  "gmail",
  "outlook",
  "microsoft_teams",
  "whatsapp_business"
] as const;

export function isImplementedCommunicationProvider(provider: CommunicationProviderName) {
  return implementedCommunicationProviders.includes(provider as (typeof implementedCommunicationProviders)[number]);
}
