import type { CommunicationThread } from "@prisma/client";

export function normalizeSubject(subject?: string | null) {
  return subject?.trim().toLowerCase() || null;
}

export function buildMessageContextualContent(input: {
  provider: string;
  senderLabel: string;
  senderEmail?: string | null;
  sentAt: Date;
  bodyText: string;
  thread: Pick<CommunicationThread, "subject" | "participantsJson">;
  attachmentNames?: string[];
}) {
  const participants = Array.isArray(input.thread.participantsJson)
    ? input.thread.participantsJson
        .map((value) => {
          if (typeof value !== "object" || value === null) {
            return null;
          }

          const participant = value as { label?: unknown; externalRef?: unknown; email?: unknown };
          return [participant.label, participant.externalRef, participant.email]
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .join(" ");
        })
        .filter((value): value is string => Boolean(value))
    : [];

  const attachmentSummary =
    input.attachmentNames && input.attachmentNames.length > 0
      ? ` Attachments: ${input.attachmentNames.join(", ")}.`
      : "";

  return [
    `Provider: ${input.provider}.`,
    `Thread subject: ${input.thread.subject ?? "untitled thread"}.`,
    participants.length > 0 ? `Participants: ${participants.join("; ")}.` : null,
    `Sender: ${input.senderLabel}${input.senderEmail ? ` <${input.senderEmail}>` : ""}.`,
    `Sent at: ${input.sentAt.toISOString()}.`,
    `Message: ${input.bodyText}.`,
    attachmentSummary
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" ");
}

export function buildMessageLexicalContent(input: {
  bodyText: string;
  senderLabel: string;
  senderEmail?: string | null;
  subject?: string | null;
  attachmentNames?: string[];
}) {
  return [
    input.subject ?? "",
    input.senderLabel,
    input.senderEmail ?? "",
    input.bodyText,
    ...(input.attachmentNames ?? [])
  ]
    .join(" ")
    .trim();
}
