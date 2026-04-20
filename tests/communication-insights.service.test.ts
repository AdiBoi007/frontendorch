import { describe, expect, it, vi } from "vitest";
import { MessageInsightsService } from "../src/modules/communications/message-insights.service.js";
import { CommunicationProposalsService } from "../src/modules/communications/communication-proposals.service.js";

describe("Communication layer C2 message insights", () => {
  it("lowers confidence and blocks proposal creation when affected refs are invalid", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      messageInsight: {
        upsert: vi.fn().mockImplementation(async ({ create }) => ({ id: "insight-1", ...create })),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "insight-1",
          messageId: "message-1",
          threadId: "thread-1",
          provider: "manual_import",
          insightType: "requirement_change",
          status: "detected",
          summary: "Requested weekly reporting",
          confidence: 0.449,
          generatedProposalId: null,
          generatedDecisionId: null,
          affectedRefsJson: { documentSectionIds: [], brainNodeIds: [] },
          message: { senderLabel: "Client", sentAt: new Date("2026-04-20T00:00:00.000Z"), bodyText: "Need weekly reporting" },
          thread: { subject: "Reporting discussion" }
        })
      },
      project: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ orgId: "org-1" })
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const service = new MessageInsightsService(
      prisma,
      {
        generateObject: vi.fn(async () => ({
          insightType: "requirement_change",
          summary: "Requested weekly reporting",
          confidence: 0.8,
          shouldCreateProposal: true,
          shouldCreateDecision: false,
          proposalType: "requirement_change",
          affectedDocumentSections: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", confidence: 0.9 }],
          affectedBrainNodes: [{ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", confidence: 0.9 }],
          oldUnderstanding: null,
          newUnderstanding: { reporting: "weekly reporting required" },
          decisionStatement: null,
          impactSummary: {
            scopeImpact: "medium",
            engineeringImpact: "medium",
            clientExpectationImpact: "high",
            summary: "Affects reporting"
          },
          uncertainty: ["Affected refs are uncertain"]
        }))
      } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn() } as any,
      { record: vi.fn().mockResolvedValue(undefined) } as any,
      { enqueue } as any,
      {
        buildMessageContext: vi.fn().mockResolvedValue({
          target: { id: "message-1", connectorId: "connector-1", provider: "manual_import", bodyHash: "hash-1", bodyText: "Need weekly reporting" },
          thread: { id: "thread-1", subject: "Reporting discussion" },
          threadMessages: [{ id: "message-1", senderLabel: "Client", sentAt: new Date("2026-04-20T00:00:00.000Z"), bodyText: "Need weekly reporting" }],
          threadStateHash: "thread-state-1",
          acceptedProductBrainSummary: "Current reporting is monthly only.",
          candidateSections: [],
          candidateBrainNodes: [],
          acceptedChanges: [],
          acceptedDecisions: [],
          unresolvedProposals: []
        })
      } as any,
      {} as any,
      { increment: vi.fn() } as any
    );

    const result = await service.classifyMessage("project-1", "message-1", null);

    expect(result.confidence).toBeLessThan(0.8);
    expect(prisma.messageInsight.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          shouldCreateProposal: false,
          affectedRefsJson: {
            documentSectionIds: [],
            brainNodeIds: []
          }
        })
      })
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      "classify_thread_insight",
      expect.objectContaining({ threadId: "thread-1" }),
      expect.stringContaining("classify-thread:thread-1:")
    );
  });

  it("keeps blockers as insight-only and does not enqueue proposal generation", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      messageInsight: {
        upsert: vi.fn().mockImplementation(async ({ create }) => ({ id: "insight-2", ...create })),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "insight-2",
          messageId: "message-2",
          threadId: "thread-2",
          provider: "manual_import",
          insightType: "blocker",
          status: "detected",
          summary: "Blocked by missing client approval",
          confidence: 0.86,
          generatedProposalId: null,
          generatedDecisionId: null,
          affectedRefsJson: { documentSectionIds: [], brainNodeIds: [] },
          message: { senderLabel: "PM", sentAt: new Date("2026-04-20T00:00:00.000Z"), bodyText: "We are blocked" },
          thread: { subject: "Approval blocker" }
        })
      },
      project: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ orgId: "org-1" })
      },
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const service = new MessageInsightsService(
      prisma,
      {
        generateObject: vi.fn(async ({ fallback }: any) => fallback())
      } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn() } as any,
      { record: vi.fn().mockResolvedValue(undefined) } as any,
      { enqueue } as any,
      {
        buildMessageContext: vi.fn().mockResolvedValue({
          target: { id: "message-2", connectorId: "connector-2", provider: "manual_import", bodyHash: "hash-2", bodyText: "We are blocked until client approves the reporting format." },
          thread: { id: "thread-2", subject: "Approval blocker" },
          threadMessages: [{ id: "message-2", senderLabel: "PM", sentAt: new Date("2026-04-20T00:00:00.000Z"), bodyText: "We are blocked until client approves the reporting format." }],
          threadStateHash: "thread-state-2",
          acceptedProductBrainSummary: "Reporting exists.",
          candidateSections: [],
          candidateBrainNodes: [],
          acceptedChanges: [],
          acceptedDecisions: [],
          unresolvedProposals: []
        })
      } as any,
      {} as any,
      { increment: vi.fn() } as any
    );

    await service.classifyMessage("project-1", "message-2", null);

    expect(prisma.messageInsight.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          insightType: "blocker",
          shouldCreateProposal: false
        })
      })
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalledWith(
      "generate_change_proposal_from_insight",
      expect.anything(),
      expect.anything()
    );
  });
});

describe("Communication layer C2 proposal dedupe", () => {
  it("links an insight to an existing proposal instead of creating a duplicate", async () => {
    const prisma = {
      specChangeProposal: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "proposal-existing",
            decisionRecordId: null,
            links: [
              { linkType: "document_section", linkRefId: "sec-1" },
              { linkType: "brain_node", linkRefId: "node-1" }
            ]
          }
        ])
      },
      messageInsight: {
        update: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const service = new CommunicationProposalsService(
      prisma,
      { ensureProjectManager: vi.fn().mockResolvedValue(undefined) } as any,
      { record: vi.fn().mockResolvedValue(undefined) } as any,
      { enqueue: vi.fn().mockResolvedValue(undefined) } as any
    );

    const result = await service.createProposalFromMessageInsight("project-1", "insight-1", "manager-1", {
      insight: {
        id: "insight-1",
        projectId: "project-1",
        threadId: "thread-1",
        summary: "Client requested weekly reporting",
        confidence: 0.92,
        insightType: "requirement_change",
        proposalType: "requirement_change",
        shouldCreateProposal: true,
        shouldCreateDecision: false,
        oldUnderstandingJson: null,
        newUnderstandingJson: { reporting: "weekly" },
        impactSummaryJson: { summary: "weekly reporting" },
        uncertaintyJson: [],
        decisionStatement: null,
        generatedProposalId: null,
        generatedDecisionId: null
      } as any,
      messageId: "message-1",
      validatedRefs: {
        documentSectionIds: ["sec-1"],
        brainNodeIds: ["node-1"]
      }
    });

    expect(result).toEqual({
      proposalId: "proposal-existing",
      decisionId: null,
      deduped: true
    });
    expect(prisma.messageInsight.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "superseded",
          generatedProposalId: "proposal-existing"
        })
      })
    );
  });
});
