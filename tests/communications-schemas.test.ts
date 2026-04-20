import { describe, expect, it } from "vitest";
import { manualImportBodySchema, timelineQuerySchema } from "../src/modules/communications/schemas.js";

describe("communication layer schemas", () => {
  it("accepts the C1 manual import payload shape", () => {
    const parsed = manualImportBodySchema.parse({
      provider: "manual_import",
      accountLabel: "Demo import",
      thread: {
        providerThreadId: "thread-reporting-001",
        subject: "Reporting requirement discussion",
        participants: [{ label: "Client", externalRef: "client@example.com" }]
      },
      messages: [
        {
          providerMessageId: "msg-001",
          senderLabel: "Client",
          sentAt: "2026-04-19T10:01:00.000Z",
          bodyText: "Can we add weekly reporting for managers?",
          messageType: "user",
          attachments: []
        }
      ]
    });

    expect(parsed.thread.providerThreadId).toBe("thread-reporting-001");
    expect(parsed.messages).toHaveLength(1);
  });

  it("parses timeline filters and cursor pagination inputs", () => {
    const parsed = timelineQuerySchema.parse({
      provider: "manual_import",
      hasChangeProposal: "true",
      search: "reporting",
      limit: "10"
    });

    expect(parsed.provider).toBe("manual_import");
    expect(parsed.hasChangeProposal).toBe(true);
    expect(parsed.limit).toBe(10);
  });
});
