/**
 * CHR-RAG Layers 2 & 3: Hybrid retrieval (vector + lexical) and hierarchical
 * evidence expansion.
 *
 * Performs:
 *  1. Embedding-based vector search against document_chunks and (optionally)
 *     communication message_chunks stored in pgvector.
 *  2. Lexical keyword search against the lexical_content text field.
 *  3. Direct lookup of brain nodes, change proposals, decisions, dashboard
 *     snapshots when the intent or context makes them relevant.
 *  4. Score fusion using a configurable weighted combination.
 *  5. Hierarchical expansion: neighbouring chunks in the same section, and
 *     brain nodes linked to the selected section/node.
 */

import type { PrismaClient } from "@prisma/client";
import type { EmbeddingProvider } from "../ai/provider.js";
import { chunkText } from "./chunking.js";
import type { RetrievalCandidate, RetrievalDomains } from "./types.js";
import type { QueryIntent } from "./intent.js";
import { AppError } from "../../app/errors.js";

export interface HybridRetrievalInput {
  projectId: string;
  pageContext?: string;
  query: string;
  queryEmbedding: number[];
  intent: QueryIntent;
  domains: RetrievalDomains;
  /**
   * Page-aware context boosts a selected anchor / node to the top.
   */
  selectedSectionId?: string;
  selectedNodeId?: string;
  /**
   * IDs of sections nearby in the same document (same heading path).
   */
  neighborSectionIds?: string[];
  topK: number;
  minScore: number;
  isClientContext: boolean;
  /**
   * Apply a multiplicative boost to accepted-truth sources.
   * Typically 1.2 from env.RETRIEVAL_ACCEPTED_TRUTH_BOOST.
   */
  acceptedTruthBoost: number;
  docWeight: number;
  commWeight: number;
}

// ---------------------------------------------------------------------------
// Lexical scoring (lightweight BM25 approximation via full-text search tokens)
// ---------------------------------------------------------------------------
function lexicalScore(text: string, queryTokens: string[]): number {
  if (queryTokens.length === 0 || !text) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) hits++;
  }
  return hits / queryTokens.length;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
}

// ---------------------------------------------------------------------------
// Document chunk retrieval
// ---------------------------------------------------------------------------
async function retrieveDocumentChunks(
  prisma: PrismaClient,
  projectId: string,
  queryEmbedding: number[],
  queryTokens: string[],
  topK: number,
  isClientContext: boolean,
  docWeight: number
): Promise<RetrievalCandidate[]> {
  // Fetch candidate chunks using raw pgvector cosine distance.
  // We also select the cosine distance so we can compute a real vector similarity score.
  const visibilityFilter = isClientContext ? "AND d.visibility = 'shared_with_client'" : "";

  const chunks = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      section_id: string | null;
      content: string;
      contextual_content: string | null;
      lexical_content: string;
      page_number: number | null;
      document_version_id: string;
      metadata_json: unknown;
      visibility: string;
      doc_title: string;
      anchor_id: string | null;
      vec_dist: number | null;
    }>
  >(
    `
    SELECT
      dc.id,
      dc.section_id,
      dc.content,
      dc.contextual_content,
      dc.lexical_content,
      dc.page_number,
      dc.document_version_id,
      dc.metadata_json,
      d.visibility,
      d.title AS doc_title,
      ds.anchor_id,
      (dc.embedding <=> $2::vector) AS vec_dist
    FROM document_chunks dc
    JOIN document_versions dv ON dv.id = dc.document_version_id
    JOIN documents d ON d.id = dv.document_id
    LEFT JOIN document_sections ds
      ON ds.id = dc.section_id
     AND ds.parse_revision = dv.parse_revision
    WHERE dc.project_id = $1
      AND dv.status = 'ready'
      AND dc.parse_revision = dv.parse_revision
      AND dc.embedding IS NOT NULL
      ${visibilityFilter}
    ORDER BY dc.embedding <=> $2::vector
    LIMIT $3
  `,
    projectId,
    `[${queryEmbedding.join(",")}]`,
    topK * 2
  );

  return chunks.map((chunk) => {
    const lex = lexicalScore(chunk.lexical_content, queryTokens);
    // cosine distance ∈ [0,2]; convert to similarity ∈ [0,1]
    const vecSim = chunk.vec_dist != null ? Math.max(0, 1 - chunk.vec_dist) : 0.5;
    const combined = (0.6 * vecSim + 0.4 * lex) * docWeight;

    return {
      id: chunk.id,
      sourceType: "document_chunk" as const,
      content: chunk.content,
      contextualContent: chunk.contextual_content ?? undefined,
      label: chunk.doc_title,
      documentSectionId: chunk.section_id ?? undefined,
      anchorId: chunk.anchor_id ?? undefined,
      pageNumber: chunk.page_number ?? undefined,
      containerId: chunk.document_version_id,
      vectorScore: vecSim,
      lexicalScore: lex,
      finalScore: combined,
      isClientSafe: chunk.visibility === "shared_with_client",
      isInternalOnly: chunk.visibility === "internal",
    };
  });
}

// ---------------------------------------------------------------------------
// Brain node retrieval (direct lookup, not embedding-based)
// ---------------------------------------------------------------------------
async function retrieveBrainNodes(
  prisma: PrismaClient,
  projectId: string,
  queryTokens: string[],
  selectedNodeId: string | undefined,
  selectedSectionId: string | undefined,
  acceptedTruthBoost: number
): Promise<RetrievalCandidate[]> {
  // Fetch nodes from the latest accepted brain graph.
  const graphArtifact = await prisma.artifactVersion.findFirst({
    where: { projectId, artifactType: "brain_graph", status: "accepted" },
    orderBy: { versionNumber: "desc" },
  });
  if (!graphArtifact) return [];

  const whereNodeIds: string[] = [];
  if (selectedNodeId) whereNodeIds.push(selectedNodeId);

  // Expand: nodes linked to the selected section.
  if (selectedSectionId) {
    const linked = await prisma.brainSectionLink.findMany({
      where: { artifactVersionId: graphArtifact.id, documentSectionId: selectedSectionId },
      select: { brainNodeId: true },
    });
    for (const l of linked) whereNodeIds.push(l.brainNodeId);
  }

  // Expand: directly connected neighbors of the selected node.
  if (selectedNodeId) {
    const edges = await prisma.brainEdge.findMany({
      where: {
        artifactVersionId: graphArtifact.id,
        OR: [{ fromNodeId: selectedNodeId }, { toNodeId: selectedNodeId }],
      },
      select: { fromNodeId: true, toNodeId: true },
    });
    for (const e of edges) {
      whereNodeIds.push(e.fromNodeId);
      whereNodeIds.push(e.toNodeId);
    }
  }

  const nodes = await prisma.brainNode.findMany({
    where: {
      artifactVersionId: graphArtifact.id,
      ...(whereNodeIds.length > 0 ? { id: { in: whereNodeIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 12,
  });

  const nodeLinks = nodes.length
    ? await prisma.brainSectionLink.findMany({
        where: {
          artifactVersionId: graphArtifact.id,
          brainNodeId: { in: nodes.map((node) => node.id) }
        },
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
      })
    : [];

  const visibilityByNodeId = new Map<string, Set<string>>();
  for (const link of nodeLinks) {
    const set = visibilityByNodeId.get(link.brainNodeId) ?? new Set<string>();
    set.add(link.documentSection.documentVersion.document.visibility);
    visibilityByNodeId.set(link.brainNodeId, set);
  }

  return nodes.map((node) => {
    const lex = lexicalScore(node.title + " " + node.summary, queryTokens);
    const isPriority = node.id === selectedNodeId;
    const linkedVisibilities = visibilityByNodeId.get(node.id);
    const isClientSafe =
      linkedVisibilities != null &&
      linkedVisibilities.size > 0 &&
      Array.from(linkedVisibilities).every((visibility) => visibility === "shared_with_client");
    return {
      id: node.id,
      sourceType: "brain_node" as const,
      content: `${node.title}: ${node.summary}`,
      label: node.title,
      containerId: graphArtifact.id,
      lexicalScore: lex,
      finalScore: (isPriority ? 2.0 : lex + 0.3) * acceptedTruthBoost,
      isClientSafe,
      isInternalOnly: !isClientSafe,
    };
  });
}

// ---------------------------------------------------------------------------
// Product Brain retrieval (accepted current truth summary)
// ---------------------------------------------------------------------------
async function retrieveProductBrain(
  prisma: PrismaClient,
  projectId: string,
  acceptedTruthBoost: number
): Promise<RetrievalCandidate[]> {
  const artifact = await prisma.artifactVersion.findFirst({
    where: { projectId, artifactType: "product_brain", status: "accepted" },
    orderBy: { versionNumber: "desc" }
  });

  if (!artifact) {
    return [];
  }

  const payload = artifact.payloadJson as Record<string, unknown>;
  const summaryParts = [
    payload.whatTheProductIs,
    Array.isArray(payload.mainFlows) ? payload.mainFlows.join("; ") : "",
    Array.isArray(payload.modules) ? payload.modules.join("; ") : "",
    Array.isArray(payload.constraints) ? payload.constraints.join("; ") : "",
    Array.isArray(payload.integrations) ? payload.integrations.join("; ") : ""
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");

  if (!summaryParts) {
    return [];
  }

  return [
    {
      id: artifact.id,
      sourceType: "product_brain" as const,
      content: summaryParts,
      label: `Product Brain v${artifact.versionNumber}`,
      containerId: artifact.id,
      finalScore: 0.75 * acceptedTruthBoost,
      isClientSafe: false,
      isInternalOnly: true
    }
  ];
}

// ---------------------------------------------------------------------------
// Change proposals retrieval
// ---------------------------------------------------------------------------
async function retrieveChanges(
  prisma: PrismaClient,
  projectId: string,
  queryTokens: string[],
  acceptedTruthBoost: number
): Promise<RetrievalCandidate[]> {
  const proposals = await prisma.specChangeProposal.findMany({
    where: { projectId, status: "accepted" },
    orderBy: { acceptedAt: "desc" },
    take: 8,
  });

  return proposals.map((proposal) => {
    const lex = lexicalScore(proposal.title + " " + proposal.summary, queryTokens);
    return {
      id: proposal.id,
      sourceType: "change_proposal" as const,
      content: `${proposal.title}: ${proposal.summary}`,
      label: proposal.title,
      lexicalScore: lex,
      finalScore: (lex + 0.4) * acceptedTruthBoost,
      isClientSafe: false,
      isInternalOnly: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Decision records retrieval
// ---------------------------------------------------------------------------
async function retrieveDecisions(
  prisma: PrismaClient,
  projectId: string,
  queryTokens: string[],
  acceptedTruthBoost: number
): Promise<RetrievalCandidate[]> {
  const decisions = await prisma.decisionRecord.findMany({
    where: { projectId, status: "accepted" },
    orderBy: { acceptedAt: "desc" },
    take: 6,
  });

  return decisions.map((decision) => {
    const lex = lexicalScore(decision.title + " " + decision.statement, queryTokens);
    return {
      id: decision.id,
      sourceType: "decision_record" as const,
      content: `Decision: ${decision.title} — ${decision.statement}`,
      label: decision.title,
      lexicalScore: lex,
      finalScore: (lex + 0.35) * acceptedTruthBoost,
      isClientSafe: false,
      isInternalOnly: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Dashboard snapshot retrieval
// ---------------------------------------------------------------------------
async function retrieveDashboard(
  prisma: PrismaClient,
  projectId: string,
  orgId: string,
  pageContext?: string
): Promise<RetrievalCandidate[]> {
  const scope = pageContext === "dashboard_general" ? "general" : "project";
  const snapshot = await prisma.dashboardSnapshot.findFirst({
    where: scope === "general" ? { orgId, projectId: null, scope } : { orgId, projectId, scope },
    orderBy: { computedAt: "desc" },
  });

  if (!snapshot) return [];

  return [
    {
      id: snapshot.id,
      sourceType: "dashboard_snapshot" as const,
      content: JSON.stringify(snapshot.payloadJson),
      label: scope === "general" ? "General Dashboard Snapshot" : "Project Dashboard Snapshot",
      finalScore: 0.7,
      isClientSafe: true,
      isInternalOnly: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Communication message retrieval (embedding-based when chunks exist)
// ---------------------------------------------------------------------------
async function retrieveMessages(
  prisma: PrismaClient,
  embedProvider: EmbeddingProvider,
  projectId: string,
  queryEmbedding: number[],
  queryTokens: string[],
  topK: number,
  commWeight: number
): Promise<RetrievalCandidate[]> {
  const messages = await prisma.communicationMessage.findMany({
    where: { projectId, bodyText: { not: "" } },
    orderBy: { sentAt: "desc" },
    take: Math.max(topK * 4, 20),
    include: { thread: true },
  });

  if (messages.length === 0) {
    return [];
  }

  await ensureCommunicationChunksIndexed(prisma, embedProvider, messages);

  const chunks = await prisma.$queryRawUnsafe<
    Array<{
      message_id: string;
      thread_id: string;
      content: string;
      contextual_content: string | null;
      lexical_content: string;
      sender_label: string;
      subject: string | null;
      vec_dist: number | null;
    }>
  >(
    `
    SELECT
      cmc.message_id,
      cmc.thread_id,
      cmc.content,
      cmc.contextual_content,
      cmc.lexical_content,
      cm.sender_label,
      ct.subject,
      (cmc.embedding <=> $2::vector) AS vec_dist
    FROM communication_message_chunks cmc
    JOIN communication_messages cm ON cm.id = cmc.message_id
    JOIN communication_threads ct ON ct.id = cmc.thread_id
    WHERE cmc.project_id = $1
      AND cmc.embedding IS NOT NULL
    ORDER BY cmc.embedding <=> $2::vector
    LIMIT $3
  `,
    projectId,
    `[${queryEmbedding.join(",")}]`,
    topK * 3
  );

  if (chunks.length > 0) {
    return chunks.map((chunk) => {
      const lex = lexicalScore(chunk.lexical_content, queryTokens);
      const vecSim = chunk.vec_dist != null ? Math.max(0, 1 - chunk.vec_dist) : 0.4;
      return {
        id: chunk.message_id,
        sourceType: "communication_message" as const,
        content: chunk.content,
        contextualContent: chunk.contextual_content ?? undefined,
        label: `${chunk.sender_label} (${chunk.subject ?? "thread"})`,
        containerId: chunk.thread_id,
        vectorScore: vecSim,
        lexicalScore: lex,
        finalScore: (0.6 * vecSim + 0.4 * lex) * commWeight,
        isClientSafe: false,
        isInternalOnly: true,
      };
    });
  }

  return messages
    .map((msg) => {
      const lex = lexicalScore(msg.bodyText, queryTokens);
      return {
        id: msg.id,
        sourceType: "communication_message" as const,
        content: msg.bodyText,
        label: `${msg.senderLabel} (${msg.thread.subject ?? "thread"})`,
        containerId: msg.threadId,
        lexicalScore: lex,
        finalScore: lex * commWeight,
        isClientSafe: false,
        isInternalOnly: true,
      };
    })
    .filter((candidate) => candidate.finalScore > 0.05);
}

async function ensureCommunicationChunksIndexed(
  prisma: PrismaClient,
  embedProvider: EmbeddingProvider,
  messages: Array<{
    id: string;
    projectId: string;
    threadId: string;
    senderLabel: string;
    bodyText: string;
    thread: { subject: string | null };
  }>
) {
  const communicationMessageChunkDelegate = (prisma as PrismaClient & {
    communicationMessageChunk: {
      findMany: typeof prisma.documentChunk.findMany;
      create: typeof prisma.documentChunk.create;
    };
  }).communicationMessageChunk;

  const existingChunks = await communicationMessageChunkDelegate.findMany({
    where: {
      messageId: {
        in: messages.map((message) => message.id)
      }
    },
    select: {
      messageId: true
    }
  });

  const indexedMessageIds = new Set(existingChunks.map((chunk: { messageId: string }) => chunk.messageId));

  for (const message of messages) {
    if (indexedMessageIds.has(message.id)) {
      continue;
    }

    const normalizedBody = message.bodyText.trim();
    if (!normalizedBody) {
      continue;
    }

    const chunks = chunkText({
      content: normalizedBody,
      documentTitle: message.thread.subject ?? `Thread ${message.threadId}`,
      kind: "communication_message",
      headingPath: [message.senderLabel],
      pageNumber: null,
      chunkSize: 220,
      overlapSize: 40
    });

    for (const chunk of chunks) {
      try {
        const created = await communicationMessageChunkDelegate.create({
          data: {
            messageId: message.id,
            threadId: message.threadId,
            projectId: message.projectId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            contextualContent: chunk.contextualContent,
            lexicalContent: chunk.contextualContent,
            tokenCount: chunk.tokenCount,
            metadataJson: {
              senderLabel: message.senderLabel,
              subject: message.thread.subject
            }
          }
        });

        const embedding = await embedProvider.embedText(chunk.contextualContent);
        const vectorLiteral = `[${embedding.join(",")}]`;
        await prisma.$executeRawUnsafe(
          "UPDATE communication_message_chunks SET embedding = CAST($1 AS vector) WHERE id = CAST($2 AS uuid)",
          vectorLiteral,
          created.id
        );
      } catch (error) {
        if (
          error instanceof AppError ||
          !(
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: string }).code === "P2002"
          )
        ) {
          throw error;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hierarchical neighbor-section expansion (doc_viewer)
// ---------------------------------------------------------------------------
/**
 * When a document section is selected, fetch adjacent sections in the same
 * document version ordered by orderIndex so the reranker can apply a moderate
 * boost to content that is structurally close to the selected anchor.
 */
async function resolveNeighborSectionIds(
  prisma: PrismaClient,
  selectedSectionId: string,
  projectId: string,
  windowRadius = 2
): Promise<string[]> {
  const selected = await prisma.documentSection.findFirst({
    where: { id: selectedSectionId, projectId },
    select: { documentVersionId: true, orderIndex: true, parseRevision: true },
  });
  if (!selected) return [];

  const neighbors = await prisma.documentSection.findMany({
    where: {
      documentVersionId: selected.documentVersionId,
      projectId,
      parseRevision: selected.parseRevision,
      orderIndex: {
        gte: selected.orderIndex - windowRadius,
        lte: selected.orderIndex + windowRadius,
      },
      id: { not: selectedSectionId },
    },
    select: { id: true },
  });
  return neighbors.map((n) => n.id);
}

// ---------------------------------------------------------------------------
// Main hybrid retrieval entry point
// ---------------------------------------------------------------------------
export async function hybridRetrieve(
  prisma: PrismaClient,
  _embedProvider: EmbeddingProvider,
  orgId: string,
  input: HybridRetrievalInput
): Promise<RetrievalCandidate[]> {
  const queryTokens = tokenize(input.query);
  const candidates: RetrievalCandidate[] = [];

  // Resolve hierarchical neighbor section IDs for doc_viewer context.
  const neighborSectionIds: string[] =
    input.selectedSectionId && !input.neighborSectionIds
      ? await resolveNeighborSectionIds(prisma, input.selectedSectionId, input.projectId)
      : (input.neighborSectionIds ?? []);

  const tasks: Array<Promise<RetrievalCandidate[]>> = [];

  if (input.domains.includeDocuments) {
    tasks.push(
      retrieveDocumentChunks(
        prisma,
        input.projectId,
        input.queryEmbedding,
        queryTokens,
        input.topK,
        input.isClientContext,
        input.docWeight
      )
    );
  }

  if (input.domains.includeBrainNodes) {
    tasks.push(
      retrieveBrainNodes(
        prisma,
        input.projectId,
        queryTokens,
        input.selectedNodeId,
        input.selectedSectionId,
        input.acceptedTruthBoost
      )
    );
  }

  if (input.domains.includeProductBrain && !input.isClientContext) {
    tasks.push(retrieveProductBrain(prisma, input.projectId, input.acceptedTruthBoost));
  }

  if (input.domains.includeChanges && !input.isClientContext) {
    tasks.push(retrieveChanges(prisma, input.projectId, queryTokens, input.acceptedTruthBoost));
  }

  if (input.domains.includeDecisions && !input.isClientContext) {
    tasks.push(retrieveDecisions(prisma, input.projectId, queryTokens, input.acceptedTruthBoost));
  }

  if (input.domains.includeDashboard) {
    tasks.push(retrieveDashboard(prisma, input.projectId, orgId, input.pageContext));
  }

  if (input.domains.includeCommunications && !input.isClientContext) {
    tasks.push(
      retrieveMessages(
        prisma,
        _embedProvider,
        input.projectId,
        input.queryEmbedding,
        queryTokens,
        input.topK,
        input.commWeight
      )
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "fulfilled") {
      candidates.push(...result.value);
    }
  }

  // Tag neighbor-section candidates so the reranker can apply a moderate boost.
  if (neighborSectionIds.length > 0) {
    const neighborSet = new Set(neighborSectionIds);
    for (const candidate of candidates) {
      if (candidate.documentSectionId && neighborSet.has(candidate.documentSectionId)) {
        candidate.isNeighborSection = true;
      }
    }
  }

  return candidates.filter((candidate) => candidate.finalScore >= input.minScore);
}
