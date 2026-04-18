import { createHash } from "node:crypto";
import type {
  ArtifactType,
  BrainNodeType,
  Prisma,
  PrismaClient,
  ProposalStatus
} from "@prisma/client";
import { AppError } from "../../app/errors.js";
import type { GenerationProvider } from "../../lib/ai/provider.js";
import { enqueueProjectDashboardRefreshByProjectId } from "../../lib/dashboard/refresh.js";
import { jobKeys } from "../../lib/jobs/keys.js";
import { JobNames, type JobDispatcher, type JobName } from "../../lib/jobs/types.js";
import { AuditService } from "../audit/service.js";
import { ProjectService } from "../projects/service.js";
import {
  brainGraphSchema,
  clarifiedBriefSchema,
  productBrainSchema,
  sourcePackageSchema
} from "./schemas.js";

type EvidenceRef = {
  documentId?: string;
  documentVersionId?: string;
  sectionId?: string;
  excerpt: string;
};

type AcceptedArtifactResult = {
  artifact: {
    id: string;
    versionNumber: number;
    payloadJson: Prisma.JsonValue;
    sourceRefsJson: Prisma.JsonValue | null;
    acceptedAt: Date | null;
    createdAt: Date;
    changeSummary: string | null;
    artifactType: ArtifactType;
    status: string;
  };
  created: boolean;
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export class BrainService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generationProvider: GenerationProvider,
    private readonly jobs: JobDispatcher,
    private readonly projectService: ProjectService,
    private readonly auditService: AuditService
  ) {}

  async rebuild(projectId: string, actorUserId: string) {
    await this.projectService.ensureProjectManager(projectId, actorUserId);
    const signature = await this.buildSourcePackageSignature(projectId);
    await this.enqueue(
      JobNames.generateSourcePackage,
      { projectId },
      jobKeys.generateSourcePackage(projectId, signature)
    );
    return { queued: true, signature };
  }

  async getCurrentBrain(projectId: string, actorUserId: string) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);

    const [projectBrain, sourcePackage, clarifiedBrief, acceptedDecisions, recentAcceptedChanges] = await Promise.all([
      this.getLatestAcceptedArtifact(projectId, "product_brain"),
      this.getLatestAcceptedArtifact(projectId, "source_package"),
      this.getLatestAcceptedArtifact(projectId, "clarified_brief"),
      this.prisma.decisionRecord.findMany({
        where: { projectId, status: "accepted" },
        orderBy: { acceptedAt: "desc" }
      }),
      this.prisma.specChangeProposal.findMany({
        where: { projectId, status: "accepted" },
        orderBy: { acceptedAt: "desc" },
        take: 10
      })
    ]);

    const currentPayload = projectBrain?.payloadJson ? productBrainSchema.parse(projectBrain.payloadJson) : null;
    const isClientRole = member.projectRole === "client";
    const clientSafeSourceRefs = currentPayload
      ? await this.filterEvidenceRefsForClient(projectId, currentPayload.evidenceRefs)
      : [];
    const clientSafePayload = currentPayload
      ? {
          ...currentPayload,
          acceptedDecisions: [],
          recentAcceptedChanges: [],
          evidenceRefs: clientSafeSourceRefs
        }
      : null;

    return {
      currentBrain:
        projectBrain && (isClientRole ? clientSafePayload : currentPayload)
          ? {
              artifactId: projectBrain.id,
              versionNumber: projectBrain.versionNumber,
              acceptedAt: projectBrain.acceptedAt,
              createdAt: projectBrain.createdAt,
              payload: isClientRole ? clientSafePayload : currentPayload,
              sourceRefs: isClientRole ? clientSafeSourceRefs : projectBrain.sourceRefsJson
            }
          : null,
      sourcePackage:
        isClientRole
          ? null
          :
        sourcePackage && sourcePackage.payloadJson
          ? {
              artifactId: sourcePackage.id,
              versionNumber: sourcePackage.versionNumber,
              payload: sourcePackageSchema.parse(sourcePackage.payloadJson)
            }
          : null,
      clarifiedBrief:
        isClientRole
          ? null
          :
        clarifiedBrief && clarifiedBrief.payloadJson
          ? {
              artifactId: clarifiedBrief.id,
              versionNumber: clarifiedBrief.versionNumber,
              payload: clarifiedBriefSchema.parse(clarifiedBrief.payloadJson)
            }
          : null,
      acceptedDecisions: isClientRole ? [] : acceptedDecisions,
      unresolvedAreas: (isClientRole ? clientSafePayload : currentPayload)?.unresolvedAreas ?? [],
      recentAcceptedChanges: isClientRole
        ? []
        : recentAcceptedChanges.map((proposal) => ({
        proposalId: proposal.id,
        title: proposal.title,
        summary: proposal.summary,
        acceptedAt: proposal.acceptedAt,
        decisionRecordId: proposal.decisionRecordId
      })),
      freshness: {
        generatedAt: projectBrain?.acceptedAt ?? projectBrain?.createdAt ?? null,
        sourcePackageGeneratedAt: sourcePackage?.acceptedAt ?? sourcePackage?.createdAt ?? null,
        clarifiedBriefGeneratedAt: clarifiedBrief?.acceptedAt ?? clarifiedBrief?.createdAt ?? null
      }
    };
  }

  async getBrainVersions(projectId: string, actorUserId: string) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    const versions = await this.prisma.artifactVersion.findMany({
      where: { projectId, artifactType: "product_brain" },
      orderBy: { versionNumber: "desc" }
    });

    if (member.projectRole !== "client") {
      return versions;
    }

    return versions.map((version) => ({
      id: version.id,
      artifactType: version.artifactType,
      versionNumber: version.versionNumber,
      status: version.status,
      createdAt: version.createdAt,
      acceptedAt: version.acceptedAt
    }));
  }

  async getCurrentGraph(projectId: string, actorUserId: string) {
    const member = await this.projectService.ensureProjectAccess(projectId, actorUserId);
    const graphArtifact = await this.getLatestAcceptedArtifact(projectId, "brain_graph");
    if (!graphArtifact) {
      throw new AppError(404, "Brain graph not found", "brain_graph_not_found");
    }

    const [nodes, edges, sectionLinks] = await Promise.all([
      this.prisma.brainNode.findMany({
        where: { artifactVersionId: graphArtifact.id },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.brainEdge.findMany({
        where: { artifactVersionId: graphArtifact.id }
      }),
      this.prisma.brainSectionLink.findMany({
        where: { artifactVersionId: graphArtifact.id }
      })
    ]);

    if (member.projectRole === "client") {
      const clientSafeNodeIds = await this.getClientSafeNodeIds(projectId, graphArtifact.id);
      const filteredNodes = nodes.filter((node) => clientSafeNodeIds.has(node.id));
      const filteredEdges = edges.filter(
        (edge) => clientSafeNodeIds.has(edge.fromNodeId) && clientSafeNodeIds.has(edge.toNodeId)
      );
      const filteredSectionLinks = sectionLinks.filter((link) => clientSafeNodeIds.has(link.brainNodeId));
      const graph = brainGraphSchema.parse(graphArtifact.payloadJson);
      const allowedNodeKeys = new Set(filteredNodes.map((node) => node.nodeKey));

      return {
        artifact: graphArtifact,
        graph: {
          ...graph,
          nodes: graph.nodes.filter((node) => allowedNodeKeys.has(node.nodeKey)),
          edges: graph.edges.filter(
            (edge) => allowedNodeKeys.has(edge.fromNodeKey) && allowedNodeKeys.has(edge.toNodeKey)
          )
        },
        nodes: filteredNodes,
        edges: filteredEdges,
        sectionLinks: filteredSectionLinks
      };
    }

    return {
      artifact: graphArtifact,
      graph: brainGraphSchema.parse(graphArtifact.payloadJson),
      nodes,
      edges,
      sectionLinks
    };
  }

  async generateSourcePackage(projectId: string, actorUserId?: string | null) {
    const readyVersions = await this.prisma.documentVersion.findMany({
      where: { projectId, status: "ready" },
      include: { document: true },
      orderBy: { createdAt: "asc" }
    });

    const signature = this.computeHash(
      readyVersions.map((version) => ({
        id: version.id,
        checksumSha256: version.checksumSha256,
        parseRevision: version.parseRevision,
        processedAt: version.processedAt?.toISOString() ?? null
      }))
    );
    const jobKey = jobKeys.generateSourcePackage(projectId, signature);
    await this.startJob(JobNames.generateSourcePackage, jobKey, { projectId });

    try {
      if (readyVersions.length === 0) {
        throw new AppError(400, "No ready documents found", "no_ready_documents");
      }

      const sections = await this.getCurrentSectionsForVersions(
        readyVersions.map((version) => ({
          documentVersionId: version.id,
          parseRevision: version.parseRevision
        }))
      );

      const fallback = this.buildSourcePackageFallback(
        readyVersions.map((version) => ({
          document: { id: version.document.id, title: version.document.title, kind: version.document.kind },
          id: version.id,
          sections: sections.filter((section) => section.documentVersionId === version.id)
        }))
      );

      const result = await this.generationProvider.generateObject({
        prompt: `Build a source package JSON for Orchestra Feature 1.\nPreserve unknowns and contradictions.\nEvidence:\n${JSON.stringify(fallback, null, 2)}`,
        schema: sourcePackageSchema,
        fallback: () => fallback
      });

      const created = await this.createAcceptedArtifact(
        projectId,
        "source_package",
        result,
        result.evidenceRefs,
        actorUserId,
        signature
      );

      if (created.created) {
        const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
        await this.auditService.record({
          orgId: project.orgId,
          projectId,
          actorUserId: actorUserId ?? null,
          eventType: "source_package_generated",
          entityType: "artifact_version",
          entityId: created.artifact.id,
          payload: { artifactType: "source_package", versionNumber: created.artifact.versionNumber }
        });
      }

      await this.finishJob(JobNames.generateSourcePackage, jobKey);
      await this.enqueue(
        JobNames.generateClarifiedBrief,
        { projectId },
        jobKeys.generateClarifiedBrief(projectId, created.artifact.id)
      );
      return created.artifact;
    } catch (error) {
      await this.failJob(JobNames.generateSourcePackage, jobKey, error);
      throw error;
    }
  }

  async generateClarifiedBrief(projectId: string, actorUserId?: string | null) {
    const sourcePackage = await this.getLatestAcceptedArtifact(projectId, "source_package");
    if (!sourcePackage) {
      throw new AppError(400, "Source package missing", "source_package_missing");
    }

    const jobKey = jobKeys.generateClarifiedBrief(projectId, sourcePackage.id);
    await this.startJob(JobNames.generateClarifiedBrief, jobKey, { projectId });

    try {
      const parsedSourcePackage = sourcePackageSchema.parse(sourcePackage.payloadJson);
      const fallback = this.buildClarifiedBriefFallback(parsedSourcePackage);
      const result = await this.generationProvider.generateObject({
        prompt: `Build a clarified brief JSON from this source package.\nPreserve uncertainty instead of guessing.\n${JSON.stringify(sourcePackage.payloadJson, null, 2)}`,
        schema: clarifiedBriefSchema,
        fallback: () => fallback
      });

      const created = await this.createAcceptedArtifact(
        projectId,
        "clarified_brief",
        result,
        result.evidenceRefs,
        actorUserId,
        sourcePackage.id
      );

      await this.finishJob(JobNames.generateClarifiedBrief, jobKey);
      await this.enqueue(
        JobNames.generateBrainGraph,
        { projectId },
        jobKeys.generateBrainGraph(projectId, created.artifact.id)
      );
      return created.artifact;
    } catch (error) {
      await this.failJob(JobNames.generateClarifiedBrief, jobKey, error);
      throw error;
    }
  }

  async generateBrainGraph(projectId: string, actorUserId?: string | null) {
    const clarifiedBrief = await this.getLatestAcceptedArtifact(projectId, "clarified_brief");
    if (!clarifiedBrief) {
      throw new AppError(400, "Clarified brief missing", "clarified_brief_missing");
    }

    const jobKey = jobKeys.generateBrainGraph(projectId, clarifiedBrief.id);
    await this.startJob(JobNames.generateBrainGraph, jobKey, { projectId });

    try {
      const parsedClarifiedBrief = clarifiedBriefSchema.parse(clarifiedBrief.payloadJson);
      const fallback = this.buildBrainGraphFallback(parsedClarifiedBrief);
      const result = await this.generationProvider.generateObject({
        prompt: `Build a structural brain graph JSON from this clarified brief.\nRepresent flows, modules, constraints, integrations, critical paths, risky areas, and unresolved nodes.\n${JSON.stringify(clarifiedBrief.payloadJson, null, 2)}`,
        schema: brainGraphSchema,
        fallback: () => fallback
      });

      const created = await this.createAcceptedArtifact(
        projectId,
        "brain_graph",
        result,
        parsedClarifiedBrief.evidenceRefs,
        actorUserId,
        clarifiedBrief.id
      );
      await this.materializeGraph(projectId, created.artifact.id, result);

      await this.finishJob(JobNames.generateBrainGraph, jobKey);
      const productSignature = await this.buildProductBrainSignature(projectId);
      await this.enqueue(
        JobNames.generateProductBrain,
        { projectId },
        jobKeys.generateProductBrain(projectId, productSignature)
      );
      return created.artifact;
    } catch (error) {
      await this.failJob(JobNames.generateBrainGraph, jobKey, error);
      throw error;
    }
  }

  async generateProductBrain(projectId: string, actorUserId?: string | null) {
    const [sourcePackage, clarifiedBrief, graph, acceptedChanges, acceptedDecisions] = await Promise.all([
      this.getLatestAcceptedArtifact(projectId, "source_package"),
      this.getLatestAcceptedArtifact(projectId, "clarified_brief"),
      this.getLatestAcceptedArtifact(projectId, "brain_graph"),
      this.prisma.specChangeProposal.findMany({
        where: { projectId, status: "accepted" },
        orderBy: { acceptedAt: "desc" }
      }),
      this.prisma.decisionRecord.findMany({
        where: { projectId, status: "accepted" },
        orderBy: { acceptedAt: "desc" }
      })
    ]);

    if (!sourcePackage || !clarifiedBrief || !graph) {
      throw new AppError(400, "Missing prerequisite artifacts", "brain_prerequisites_missing");
    }

    const signature = await this.buildProductBrainSignature(projectId, {
      sourcePackageId: sourcePackage.id,
      clarifiedBriefId: clarifiedBrief.id,
      graphId: graph.id,
      acceptedChanges,
      acceptedDecisions
    });
    const jobKey = jobKeys.generateProductBrain(projectId, signature);
    await this.startJob(JobNames.generateProductBrain, jobKey, { projectId });

    try {
      const fallback = this.buildProductBrainFallback({
        sourcePackage: sourcePackageSchema.parse(sourcePackage.payloadJson),
        clarifiedBrief: clarifiedBriefSchema.parse(clarifiedBrief.payloadJson),
        acceptedChanges,
        acceptedDecisions
      });

      const result = await this.generationProvider.generateObject({
        prompt: `Build the current Product Brain JSON from:\nSource Package: ${JSON.stringify(sourcePackage.payloadJson, null, 2)}\nClarified Brief: ${JSON.stringify(clarifiedBrief.payloadJson, null, 2)}\nBrain Graph: ${JSON.stringify(graph.payloadJson, null, 2)}\nAccepted Changes: ${JSON.stringify(acceptedChanges, null, 2)}\nAccepted Decisions: ${JSON.stringify(acceptedDecisions, null, 2)}`,
        schema: productBrainSchema,
        fallback: () => fallback
      });

      const created = await this.createAcceptedArtifact(
        projectId,
        "product_brain",
        result,
        result.evidenceRefs,
        actorUserId,
        signature
      );
      await this.finishJob(JobNames.generateProductBrain, jobKey);
      await enqueueProjectDashboardRefreshByProjectId(this.prisma, this.jobs, projectId, "product_brain_accepted");
      return created.artifact;
    } catch (error) {
      await this.failJob(JobNames.generateProductBrain, jobKey, error);
      throw error;
    }
  }

  private buildSourcePackageFallback(
    readyVersions: Array<{
      document: { id: string; title: string; kind: string };
      id: string;
      sections: Array<{ id: string; anchorText: string | null; normalizedText: string }>;
    }>
  ) {
    const allSections = readyVersions.flatMap((version) =>
      version.sections.map((section) => ({
        documentId: version.document.id,
        documentVersionId: version.id,
        sectionId: section.id,
        title: section.anchorText ?? version.document.title,
        text: section.normalizedText,
        kind: version.document.kind
      }))
    );

    const features = allSections
      .filter((section) => /feature|module|scope|requirement|workflow/i.test(section.title + " " + section.text))
      .map((section) => section.title);
    const constraints = allSections
      .filter((section) => /constraint|must|should|limit|cannot|only/i.test(section.text))
      .slice(0, 12)
      .map((section) => section.text.slice(0, 180));
    const integrations = allSections
      .filter((section) => /integration|api|slack|gmail|whatsapp|s3|postgres|redis/i.test(section.text))
      .map((section) => section.title);
    const contradictions = allSections
      .filter((section) => /however|but|conflict|contradict/i.test(section.text))
      .map((section) => section.title);
    const unknowns = allSections
      .filter((section) => /\?/.test(section.text) || /unknown|tbd|unclear|unresolved|later/i.test(section.text))
      .map((section) => section.title);
    const actors = allSections
      .filter((section) => /actor|user|client|manager|dev/i.test(section.text))
      .map((section) => section.title);

    const evidenceRefs: EvidenceRef[] = allSections.slice(0, 20).map((section) => ({
      documentId: section.documentId,
      documentVersionId: section.documentVersionId,
      sectionId: section.sectionId,
      excerpt: section.text.slice(0, 220)
    }));

    return {
      projectSummary: unique(readyVersions.map((version) => version.document.title)).join(", "),
      actors: unique(actors),
      features: unique(features),
      constraints: unique(constraints),
      integrations: unique(integrations),
      contradictions: unique(contradictions),
      unknowns: unique(unknowns),
      risks: unique([...unknowns, ...contradictions]).slice(0, 8),
      sourceConfidence: Math.min(1, 0.35 + readyVersions.length * 0.15),
      evidenceRefs
    };
  }

  private buildClarifiedBriefFallback(sourcePackage: ReturnType<typeof sourcePackageSchema.parse>) {
    return {
      summary: sourcePackage.projectSummary,
      targetUsers: sourcePackage.actors,
      flows: sourcePackage.features.slice(0, 10),
      scope: sourcePackage.features,
      constraints: sourcePackage.constraints,
      integrations: sourcePackage.integrations,
      unresolvedDecisions: sourcePackage.unknowns,
      assumptions:
        sourcePackage.contradictions.length > 0
          ? sourcePackage.contradictions
          : ["No assumption was accepted beyond what the source package could support."],
      risks: sourcePackage.risks,
      evidenceRefs: sourcePackage.evidenceRefs
    };
  }

  private buildBrainGraphFallback(clarifiedBrief: ReturnType<typeof clarifiedBriefSchema.parse>) {
    const sharedSectionIds = clarifiedBrief.evidenceRefs
      .map((ref) => ref.sectionId)
      .filter((value): value is string => Boolean(value));

    const moduleNodes = clarifiedBrief.scope.map((item, index) => ({
      nodeKey: `module-${index + 1}`,
      nodeType: "module" as const,
      title: item,
      summary: item,
      status: "active" as const,
      priority: "medium" as const,
      linkedSectionIds: sharedSectionIds
    }));
    const flowNodes = clarifiedBrief.flows.map((item, index) => ({
      nodeKey: `flow-${index + 1}`,
      nodeType: "flow" as const,
      title: item,
      summary: item,
      status: "active" as const,
      priority: "high" as const,
      linkedSectionIds: sharedSectionIds
    }));
    const constraintNodes = clarifiedBrief.constraints.map((item, index) => ({
      nodeKey: `constraint-${index + 1}`,
      nodeType: "constraint" as const,
      title: item.slice(0, 80),
      summary: item,
      status: "active" as const,
      priority: "high" as const,
      linkedSectionIds: sharedSectionIds
    }));
    const unresolvedNodes = clarifiedBrief.unresolvedDecisions.map((item, index) => ({
      nodeKey: `unknown-${index + 1}`,
      nodeType: "unknown" as const,
      title: item,
      summary: item,
      status: "unresolved" as const,
      linkedSectionIds: sharedSectionIds
    }));
    const integrationNodes = clarifiedBrief.integrations.map((item, index) => ({
      nodeKey: `integration-${index + 1}`,
      nodeType: "integration" as const,
      title: item,
      summary: item,
      status: "active" as const,
      priority: "medium" as const,
      linkedSectionIds: sharedSectionIds
    }));

    return {
      nodes: [...moduleNodes, ...flowNodes, ...constraintNodes, ...integrationNodes, ...unresolvedNodes],
      edges: [
        ...flowNodes.flatMap((flowNode) =>
          moduleNodes.slice(0, 3).map((moduleNode) => ({
            fromNodeKey: flowNode.nodeKey,
            toNodeKey: moduleNode.nodeKey,
            edgeType: "depends_on" as const
          }))
        ),
        ...constraintNodes.flatMap((constraintNode) =>
          moduleNodes.slice(0, 3).map((moduleNode) => ({
            fromNodeKey: constraintNode.nodeKey,
            toNodeKey: moduleNode.nodeKey,
            edgeType: "supported_by" as const
          }))
        ),
        ...integrationNodes.flatMap((integrationNode) =>
          moduleNodes.slice(0, 2).map((moduleNode) => ({
            fromNodeKey: integrationNode.nodeKey,
            toNodeKey: moduleNode.nodeKey,
            edgeType: "relates_to" as const
          }))
        )
      ],
      criticalPaths: flowNodes.map((node) => node.nodeKey),
      riskyAreas: clarifiedBrief.risks,
      unresolvedAreas: clarifiedBrief.unresolvedDecisions
    };
  }

  private buildProductBrainFallback(input: {
    sourcePackage: ReturnType<typeof sourcePackageSchema.parse>;
    clarifiedBrief: ReturnType<typeof clarifiedBriefSchema.parse>;
    acceptedChanges: Array<{ id: string; title: string; summary: string }>;
    acceptedDecisions: Array<{ id: string; title: string; statement: string }>;
  }) {
    return {
      whatTheProductIs: input.clarifiedBrief.summary,
      whoItIsFor: input.clarifiedBrief.targetUsers,
      mainFlows: input.clarifiedBrief.flows,
      modules: input.sourcePackage.features,
      constraints: input.clarifiedBrief.constraints,
      integrations: input.clarifiedBrief.integrations,
      unresolvedAreas: input.clarifiedBrief.unresolvedDecisions,
      acceptedDecisions: input.acceptedDecisions.map((decision) => ({
        decisionId: decision.id,
        title: decision.title,
        statement: decision.statement
      })),
      recentAcceptedChanges: input.acceptedChanges.map((proposal) => ({
        proposalId: proposal.id,
        title: proposal.title,
        summary: proposal.summary
      })),
      evidenceRefs: input.clarifiedBrief.evidenceRefs
    };
  }

  private async materializeGraph(
    projectId: string,
    artifactVersionId: string,
    graph: ReturnType<typeof brainGraphSchema.parse>
  ) {
    const existingCount = await this.prisma.brainNode.count({
      where: { artifactVersionId }
    });
    if (existingCount > 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const nodeIdByKey = new Map<string, string>();
      const validSectionIds = new Set(
        (
          await tx.documentSection.findMany({
            where: {
              projectId,
              id: {
                in: unique(graph.nodes.flatMap((node) => node.linkedSectionIds))
              }
            },
            select: { id: true }
          })
        ).map((section) => section.id)
      );

      for (const node of graph.nodes) {
        const created = await tx.brainNode.create({
          data: {
            artifactVersionId,
            projectId,
            nodeKey: node.nodeKey,
            nodeType: node.nodeType as BrainNodeType,
            title: node.title,
            summary: node.summary,
            status: node.status,
            priority: node.priority,
            metadataJson: { linkedSectionIds: node.linkedSectionIds }
          }
        });
        nodeIdByKey.set(node.nodeKey, created.id);

        for (const sectionId of node.linkedSectionIds) {
          if (!validSectionIds.has(sectionId)) {
            continue;
          }

          await tx.brainSectionLink.create({
            data: {
              projectId,
              artifactVersionId,
              brainNodeId: created.id,
              documentSectionId: sectionId,
              relationship: node.status === "unresolved" ? "clarifies" : "supports"
            }
          });
        }
      }

      for (const edge of graph.edges) {
        const fromNodeId = nodeIdByKey.get(edge.fromNodeKey);
        const toNodeId = nodeIdByKey.get(edge.toNodeKey);
        if (!fromNodeId || !toNodeId) {
          continue;
        }

        await tx.brainEdge.create({
          data: {
            artifactVersionId,
            projectId,
            fromNodeId,
            toNodeId,
            edgeType: edge.edgeType
          }
        });
      }
    });
  }

  private async createAcceptedArtifact(
    projectId: string,
    artifactType: ArtifactType,
    payload: unknown,
    evidenceRefs: EvidenceRef[],
    createdBy: string | null | undefined,
    signature: string
  ): Promise<AcceptedArtifactResult> {
    return this.prisma.$transaction(async (tx) => {
      const latestAccepted = await tx.artifactVersion.findFirst({
        where: { projectId, artifactType, status: "accepted" },
        orderBy: { versionNumber: "desc" }
      });

      if (latestAccepted?.changeSummary === signature) {
        return { artifact: latestAccepted, created: false };
      }

      const latestAny = await tx.artifactVersion.findFirst({
        where: { projectId, artifactType },
        orderBy: { versionNumber: "desc" }
      });

      await tx.artifactVersion.updateMany({
        where: { projectId, artifactType, status: "accepted" },
        data: { status: "superseded" }
      });

      const artifact = await tx.artifactVersion.create({
        data: {
          projectId,
          artifactType,
          versionNumber: (latestAny?.versionNumber ?? 0) + 1,
          parentVersionId: latestAny?.id ?? null,
          status: "accepted",
          payloadJson: payload as object,
          sourceRefsJson: evidenceRefs as object,
          changeSummary: signature,
          createdBy: createdBy ?? null,
          acceptedAt: new Date()
        }
      });

      await tx.socratesSuggestion.deleteMany({
        where: {
          session: {
            projectId
          }
        }
      });

      return { artifact, created: true };
    });
  }

  private async enqueue(jobName: JobName, payload: unknown, idempotencyKey: string) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        status: "pending",
        payloadJson: payload as object,
        finishedAt: null,
        lastError: null
      },
      create: {
        jobType: jobName,
        status: "pending",
        idempotencyKey,
        payloadJson: payload as object
      }
    });
    await this.jobs.enqueue(jobName, payload, idempotencyKey);
  }

  private async startJob(jobType: JobName, idempotencyKey: string, payload: unknown) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType,
        status: "running",
        payloadJson: payload as object,
        startedAt: new Date(),
        finishedAt: null,
        lastError: null,
        attemptCount: {
          increment: 1
        }
      },
      create: {
        jobType,
        status: "running",
        idempotencyKey,
        payloadJson: payload as object,
        startedAt: new Date(),
        attemptCount: 1
      }
    });
  }

  private async finishJob(jobType: JobName, idempotencyKey: string) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType,
        status: "completed",
        finishedAt: new Date(),
        lastError: null
      },
      create: {
        jobType,
        status: "completed",
        idempotencyKey,
        finishedAt: new Date()
      }
    });
  }

  private async failJob(jobType: JobName, idempotencyKey: string, error: unknown) {
    await this.prisma.jobRun.upsert({
      where: { idempotencyKey },
      update: {
        jobType,
        status: "failed",
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Unknown error"
      },
      create: {
        jobType,
        status: "failed",
        idempotencyKey,
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }

  private async getLatestAcceptedArtifact(projectId: string, artifactType: ArtifactType) {
    return this.prisma.artifactVersion.findFirst({
      where: { projectId, artifactType, status: "accepted" },
      orderBy: { versionNumber: "desc" }
    });
  }

  private computeHash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
  }

  private async buildSourcePackageSignature(projectId: string) {
    const readyVersions = await this.prisma.documentVersion.findMany({
      where: { projectId, status: "ready" },
      select: {
        id: true,
        checksumSha256: true,
        parseRevision: true,
        processedAt: true
      },
      orderBy: { createdAt: "asc" }
    });
    return this.computeHash(readyVersions);
  }

  private async buildProductBrainSignature(
    projectId: string,
    input?: {
      sourcePackageId: string;
      clarifiedBriefId: string;
      graphId: string;
      acceptedChanges: Array<{ id: string; updatedAt: Date; acceptedAt: Date | null }>;
      acceptedDecisions: Array<{ id: string; updatedAt: Date; acceptedAt: Date | null }>;
    }
  ) {
    const resolved =
      input ??
      (async () => {
        const [sourcePackage, clarifiedBrief, graph, acceptedChanges, acceptedDecisions] = await Promise.all([
          this.getLatestAcceptedArtifact(projectId, "source_package"),
          this.getLatestAcceptedArtifact(projectId, "clarified_brief"),
          this.getLatestAcceptedArtifact(projectId, "brain_graph"),
          this.prisma.specChangeProposal.findMany({
            where: { projectId, status: "accepted" as ProposalStatus },
            select: { id: true, updatedAt: true, acceptedAt: true }
          }),
          this.prisma.decisionRecord.findMany({
            where: { projectId, status: "accepted" },
            select: { id: true, updatedAt: true, acceptedAt: true }
          })
        ]);

        if (!sourcePackage || !clarifiedBrief || !graph) {
          throw new AppError(400, "Missing prerequisite artifacts", "brain_prerequisites_missing");
        }

        return {
          sourcePackageId: sourcePackage.id,
          clarifiedBriefId: clarifiedBrief.id,
          graphId: graph.id,
          acceptedChanges,
          acceptedDecisions
        };
      })();

    const state = await resolved;
    return this.computeHash({
      sourcePackageId: state.sourcePackageId,
      clarifiedBriefId: state.clarifiedBriefId,
      graphId: state.graphId,
      acceptedChanges: state.acceptedChanges.map((proposal) => ({
        id: proposal.id,
        updatedAt: proposal.updatedAt.toISOString(),
        acceptedAt: proposal.acceptedAt?.toISOString() ?? null
      })),
      acceptedDecisions: state.acceptedDecisions.map((decision) => ({
        id: decision.id,
        updatedAt: decision.updatedAt.toISOString(),
        acceptedAt: decision.acceptedAt?.toISOString() ?? null
      }))
    });
  }

  private async getCurrentSectionsForVersions(
    versions: Array<{ documentVersionId: string; parseRevision: number }>
  ) {
    const sections = await this.prisma.documentSection.findMany({
      where: {
        documentVersionId: {
          in: versions.map((item) => item.documentVersionId)
        }
      },
      orderBy: {
        orderIndex: "asc"
      }
    });

    const parseRevisionByVersion = new Map(versions.map((item) => [item.documentVersionId, item.parseRevision]));
    return sections.filter(
      (section) => parseRevisionByVersion.get(section.documentVersionId) === section.parseRevision
    );
  }

  private async filterEvidenceRefsForClient(projectId: string, evidenceRefs: EvidenceRef[]) {
    const visibleDocumentIds = new Set(
      (
        await this.prisma.document.findMany({
          where: {
            projectId,
            visibility: "shared_with_client"
          },
          select: {
            id: true
          }
        })
      ).map((document) => document.id)
    );

    return evidenceRefs.filter((ref) => !ref.documentId || visibleDocumentIds.has(ref.documentId));
  }

  private async getClientSafeNodeIds(projectId: string, artifactVersionId: string) {
    const links = await this.prisma.brainSectionLink.findMany({
      where: { projectId, artifactVersionId },
      include: {
        documentSection: {
          include: {
            documentVersion: {
              include: {
                document: true
              }
            }
          }
        }
      }
    });

    const visibilityByNodeId = new Map<string, Set<string>>();
    for (const link of links) {
      const visibilities = visibilityByNodeId.get(link.brainNodeId) ?? new Set<string>();
      visibilities.add(link.documentSection.documentVersion.document.visibility);
      visibilityByNodeId.set(link.brainNodeId, visibilities);
    }

    const safeNodeIds = new Set<string>();
    for (const [nodeId, visibilities] of visibilityByNodeId.entries()) {
      if (visibilities.size > 0 && Array.from(visibilities).every((value) => value === "shared_with_client")) {
        safeNodeIds.add(nodeId);
      }
    }

    return safeNodeIds;
  }
}
