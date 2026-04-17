import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/app/errors.js";
import { ChangeProposalService } from "../src/modules/changes/service.js";

describe("ChangeProposalService", () => {
  it("rejects proposal creation when linked targets do not belong to the project", async () => {
    const prisma = {
      project: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1" })
      },
      documentSection: {
        count: vi.fn().mockResolvedValue(0)
      },
      brainNode: {
        count: vi.fn().mockResolvedValue(1)
      },
      communicationMessage: {
        count: vi.fn().mockResolvedValue(1)
      }
    } as any;

    const service = new ChangeProposalService(
      prisma,
      { enqueue: vi.fn() } as any,
      { ensureProjectManager: vi.fn().mockResolvedValue(undefined), ensureProjectAccess: vi.fn() } as any,
      {} as any,
      { record: vi.fn() } as any
    );

    await expect(
      service.create("project-1", "manager-1", {
        title: "Change payments copy",
        summary: "Update the CTA wording",
        proposalType: "clarification",
        affectedDocumentSectionIds: ["sec-1"],
        affectedBrainNodeIds: ["node-1"],
        communicationMessageIds: ["msg-1"],
        externalEvidenceRefs: []
      })
    ).rejects.toMatchObject({
      code: "invalid_document_section_links",
      statusCode: 422
    });
  });

  it("creates a decision record and enqueues application when accepting a decision change", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const tx = {
      decisionRecord: {
        create: vi.fn().mockResolvedValue({ id: "decision-1" })
      },
      specChangeProposal: {
        update: vi.fn().mockResolvedValue(undefined)
      }
    };

    const prisma = {
      project: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1" })
      },
      specChangeProposal: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "proposal-1",
          projectId: "project-1",
          proposalType: "decision_change",
          status: "needs_review",
          sourceMessageCount: 1,
          externalEvidenceRefsJson: [],
          decisionRecordId: null,
          links: [
            { linkType: "document_section" },
            { linkType: "brain_node" }
          ]
        })
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
      jobRun: {
        upsert: vi.fn().mockResolvedValue(undefined)
      }
    } as any;

    const service = new ChangeProposalService(
      prisma,
      { enqueue } as any,
      { ensureProjectManager: vi.fn().mockResolvedValue(undefined), ensureProjectAccess: vi.fn() } as any,
      {} as any,
      { record: vi.fn() } as any
    );

    prisma.specChangeProposal.findFirstOrThrow.mockResolvedValue({
      id: "proposal-1",
      projectId: "project-1",
      proposalType: "decision_change",
      status: "needs_review",
      sourceMessageCount: 1,
      externalEvidenceRefsJson: [],
      decisionRecordId: null,
      links: [
        { linkType: "document_section" },
        { linkType: "brain_node" }
      ]
    });

    prisma.specChangeProposal.findFirstOrThrow.mockResolvedValueOnce({
      id: "proposal-1",
      projectId: "project-1",
      proposalType: "decision_change",
      status: "needs_review",
      sourceMessageCount: 1,
      externalEvidenceRefsJson: [],
      decisionRecordId: null,
      links: [
        { linkType: "document_section" },
        { linkType: "brain_node" }
      ]
    });
    prisma.specChangeProposal.findFirstOrThrow.mockResolvedValueOnce({
      id: "proposal-1",
      projectId: "project-1",
      proposalType: "decision_change",
      status: "accepted"
    });

    prisma.specChangeProposal.findFirstOrThrow.mockImplementation(async () => ({
      id: "proposal-1",
      projectId: "project-1",
      proposalType: "decision_change",
      status: "accepted",
      sourceMessageCount: 1,
      externalEvidenceRefsJson: [],
      decisionRecordId: "decision-1",
      links: [
        { linkType: "document_section" },
        { linkType: "brain_node" }
      ]
    }));

    await service.accept("project-1", "proposal-1", "manager-1");

    expect(tx.decisionRecord.create).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      "apply_accepted_change",
      { projectId: "project-1", proposalId: "proposal-1" },
      "apply-change:proposal-1"
    );
  });

  it("returns the existing accepted brain version during duplicate apply runs", async () => {
    const brainService = {
      generateBrainGraph: vi.fn(),
      generateProductBrain: vi.fn()
    };

    const prisma = {
      specChangeProposal: {
        findFirst: vi.fn().mockResolvedValue({
          id: "proposal-1",
          projectId: "project-1",
          status: "accepted",
          acceptedBrainVersionId: "brain-1",
          acceptedBy: "manager-1",
          links: [{ linkType: "document_section" }]
        })
      },
      artifactVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: "brain-1",
          artifactType: "product_brain"
        })
      }
    } as any;

    const service = new ChangeProposalService(
      prisma,
      { enqueue: vi.fn() } as any,
      { ensureProjectManager: vi.fn(), ensureProjectAccess: vi.fn() } as any,
      brainService as any,
      { record: vi.fn() } as any
    );

    const result = await service.applyAcceptedProposal("project-1", "proposal-1");

    expect(result).toEqual({
      id: "brain-1",
      artifactType: "product_brain"
    });
    expect(brainService.generateProductBrain).not.toHaveBeenCalled();
  });
});
