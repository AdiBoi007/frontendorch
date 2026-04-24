import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileTextIcon, SearchIcon, UploadCloudIcon, UploadIcon } from "../components/ui/AppIcons";
import { useAppShell } from "../context/AppShellContext";
import {
  apiGetDocument,
  apiListDocuments,
  apiRebuildBrain,
  apiReprocessDocument,
  apiUploadDocument,
  type DocumentItem,
  type DocumentKind,
  type DocumentParseStatus,
} from "../lib/api/documents";
import { ApiError } from "../lib/http";

// ── Types ──────────────────────────────────────────────────────────────────────

type MemoryTab = "all" | "source-docs" | "notes" | "other";

type TypeVisual = {
  bg: string;
  iconColor: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const tabOptions: Array<{ id: MemoryTab; label: string }> = [
  { id: "all", label: "ALL" },
  { id: "source-docs", label: "SOURCE DOCS" },
  { id: "notes", label: "NOTES" },
  { id: "other", label: "OTHER" },
];

const KIND_LABELS: Record<DocumentKind, string> = {
  prd: "PRD",
  srs: "SRS",
  meeting_note: "MEETING NOTE",
  call_note: "CALL NOTE",
  reference: "REFERENCE",
  internal_note: "INTERNAL NOTE",
  other: "OTHER",
};

const KIND_VISUALS: Record<DocumentKind, TypeVisual> = {
  prd: { bg: "#f4f4f5", iconColor: "#111827" },
  srs: { bg: "#f4f4f5", iconColor: "#111827" },
  meeting_note: { bg: "#fef6ec", iconColor: "#f59340" },
  call_note: { bg: "#fef6ec", iconColor: "#f59340" },
  reference: { bg: "#f4f2fc", iconColor: "#8b7fd4" },
  internal_note: { bg: "#f0fdf4", iconColor: "#16a34a" },
  other: { bg: "#f4f4f5", iconColor: "#888888" },
};

const UPLOAD_KINDS: DocumentKind[] = [
  "prd",
  "srs",
  "meeting_note",
  "call_note",
  "reference",
  "internal_note",
  "other",
];

const TERMINAL_STATUSES: Set<DocumentParseStatus | null> = new Set(["ready", "partial", "failed"]);

function isTerminal(status: DocumentParseStatus | null): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDocTab(doc: DocumentItem): Exclude<MemoryTab, "all"> {
  if (doc.kind === "prd" || doc.kind === "srs") return "source-docs";
  if (doc.kind === "meeting_note" || doc.kind === "call_note") return "notes";
  return "other";
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

// ── Status dot component ───────────────────────────────────────────────────────

function StatusDot({ status }: { status: DocumentParseStatus | null }) {
  if (status === "processing" || status === "pending") {
    return (
      <motion.span
        className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f59340]"
        animate={{ scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }
  if (status === "ready") {
    return <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#111827]" />;
  }
  if (status === "partial") {
    return <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f59340]" />;
  }
  if (status === "failed") {
    return <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e05555]" />;
  }
  // null — no version yet
  return <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#cccccc]" />;
}

function statusLabel(status: DocumentParseStatus | null): string {
  if (status === null) return "No version";
  const map: Record<DocumentParseStatus, string> = {
    pending: "Queued",
    processing: "Processing…",
    ready: "Ready",
    partial: "Partial",
    failed: "Failed",
  };
  return map[status];
}

// ── Document card ──────────────────────────────────────────────────────────────

function DocCard({
  doc,
  index,
  total,
  isManager,
  onOpenViewer,
  onRebuildBrain,
  onReprocess,
}: {
  doc: DocumentItem;
  index: number;
  total: number;
  isManager: boolean;
  onOpenViewer: (docId: string) => void;
  onRebuildBrain: () => void;
  onReprocess: (docId: string) => void;
}) {
  const visual = KIND_VISUALS[doc.kind];
  const roundedClass =
    total === 1
      ? "rounded-[16px]"
      : index === 0
        ? "rounded-t-[16px]"
        : index === total - 1
          ? "rounded-b-[16px]"
          : "";

  const isProcessing = doc.parseStatus === "pending" || doc.parseStatus === "processing";
  const isReady = doc.parseStatus === "ready" || doc.parseStatus === "partial";

  return (
    <motion.article
      key={doc.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={[
        "relative border border-[#e8e8e4] bg-white px-6 py-5 transition-colors",
        roundedClass,
        index > 0 ? "-mt-px" : "",
        isReady ? "cursor-pointer hover:bg-[#fafaf8]" : "cursor-default",
      ].join(" ")}
      onClick={() => isReady && onOpenViewer(doc.id)}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: visual.bg, color: visual.iconColor }}
        >
          <FileTextIcon className="h-[18px] w-[18px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate font-syne text-[15px] font-semibold text-[#0a0a0a]">
              {doc.title}
            </p>
            <StatusDot status={doc.parseStatus} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-[6px] font-mono text-[12px] text-[#888888]">
            <span className="uppercase">{KIND_LABELS[doc.kind]}</span>
            <span>·</span>
            <span>{statusLabel(doc.parseStatus)}</span>
            <span>·</span>
            <span>{formatRelativeTime(doc.updatedAt)}</span>
            {doc.visibility === "shared_with_client" && (
              <>
                <span>·</span>
                <span className="text-[#8b7fd4]">CLIENT VISIBLE</span>
              </>
            )}
          </div>

          {/* CTAs — only show when terminal */}
          {isTerminal(doc.parseStatus) && (
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {isReady && (
                <button
                  type="button"
                  onClick={() => onOpenViewer(doc.id)}
                  className="rounded-lg border border-[#e5e5e0] bg-white px-3 py-1.5 font-bebas text-[11px] tracking-[0.08em] text-[#0a0a0a] transition-colors hover:border-[#0a0a0a] hover:bg-[#f4f4f5]"
                >
                  OPEN VIEWER
                </button>
              )}
              {isManager && isReady && (
                <button
                  type="button"
                  onClick={onRebuildBrain}
                  className="rounded-lg border border-[#e5e5e0] bg-white px-3 py-1.5 font-bebas text-[11px] tracking-[0.08em] text-[#8b7fd4] transition-colors hover:border-[#8b7fd4]"
                >
                  REBUILD BRAIN
                </button>
              )}
              {doc.parseStatus === "failed" && isManager && (
                <button
                  type="button"
                  onClick={() => onReprocess(doc.id)}
                  className="rounded-lg border border-[#e5e5e0] bg-white px-3 py-1.5 font-bebas text-[11px] tracking-[0.08em] text-[#e05555] transition-colors hover:border-[#e05555]"
                >
                  RETRY PARSE
                </button>
              )}
              {doc.parseStatus === "failed" && !isManager && (
                <span className="font-mono text-[11px] text-[#e05555]">
                  Parse failed — contact your manager
                </span>
              )}
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <p className="mt-2 font-mono text-[11px] text-[#f59340]">
              {doc.parseStatus === "pending" ? "Queued for processing…" : "Parsing document…"}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function ProjectMemoryPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { isManager } = useAppShell();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const docsRef = useRef<DocumentItem[]>([]);

  // List state
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<MemoryTab>("all");

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<DocumentKind | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Brain rebuild state
  const [brainRebuildState, setBrainRebuildState] = useState<"idle" | "queuing" | "queued" | "error">("idle");
  const brainRebuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync so polling interval can read latest docs without stale closure
  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  // ── Initial load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    setDocsLoading(true);
    setDocsError(null);

    apiListDocuments(projectId)
      .then(({ items }) => {
        if (!cancelled) {
          setDocs(items);
          setDocsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDocsError(err instanceof ApiError ? err.message : "Failed to load documents.");
          setDocsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── Polling for non-terminal docs ─────────────────────────────────────────────
  // One interval per project; uses docsRef to avoid re-creating on every docs change.

  useEffect(() => {
    if (!projectId) return;

    const id = setInterval(() => {
      const current = docsRef.current;
      const toUpdate = current.filter((d) => !isTerminal(d.parseStatus));
      if (toUpdate.length === 0) return;

      void Promise.allSettled(
        toUpdate.map((d) => apiGetDocument(projectId, d.id))
      ).then((results) => {
        setDocs((prev) => {
          const map = new Map(prev.map((d) => [d.id, d]));
          results.forEach((result) => {
            if (result.status === "fulfilled") {
              const u = result.value;
              map.set(u.id, {
                id: u.id,
                projectId: u.projectId,
                title: u.title,
                kind: u.kind,
                visibility: u.visibility,
                createdAt: u.createdAt,
                updatedAt: u.updatedAt,
                parseStatus: u.parseStatus,
                lastProcessedAt: u.lastProcessedAt,
                currentVersion: u.currentVersion,
              });
            }
          });
          return Array.from(map.values());
        });
      });
    }, 3000);

    return () => clearInterval(id);
  }, [projectId]);

  // Cleanup brain rebuild timer on unmount
  useEffect(() => {
    return () => {
      if (brainRebuildTimer.current) clearTimeout(brainRebuildTimer.current);
    };
  }, []);

  // ── Filtered docs ─────────────────────────────────────────────────────────────

  const visibleDocs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return docs.filter((doc) => {
      const matchesTab = activeTab === "all" || getDocTab(doc) === activeTab;
      if (!matchesTab) return false;
      if (!query) return true;
      return [doc.title, doc.kind, doc.visibility].some((v) => v.toLowerCase().includes(query));
    });
  }, [activeTab, docs, searchQuery]);

  // ── Upload modal handlers ─────────────────────────────────────────────────────

  const closeUploadModal = () => {
    setIsUploadOpen(false);
    setSelectedKind(null);
    setSelectedFile(null);
    setIsDropActive(false);
    setIsUploading(false);
    setUploadError(null);
  };

  const handleFileSelection = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setIsDropActive(false);
    setUploadError(null);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    handleFileSelection(event.dataTransfer.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedKind || !projectId) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("kind", selectedKind);
      // Backend defaults title to filename if not provided; send it explicitly for cleanliness
      const titleGuess = selectedFile.name.replace(/\.[^.]+$/, "").trim() || selectedFile.name;
      formData.append("title", titleGuess.length >= 2 ? titleGuess : `${KIND_LABELS[selectedKind]} ${titleGuess}`);
      formData.append("visibility", "internal");

      const uploadResult = await apiUploadDocument(projectId, formData);

      // Immediately add an optimistic pending row so the user sees the document right away
      const optimisticDoc: DocumentItem = {
        id: uploadResult.documentId,
        projectId,
        title: titleGuess,
        kind: selectedKind,
        visibility: "internal",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parseStatus: uploadResult.status ?? "pending",
        lastProcessedAt: null,
        currentVersion: {
          id: uploadResult.documentVersionId,
          status: uploadResult.status ?? "pending",
          parseRevision: uploadResult.parseRevision ?? 1,
          parseConfidence: null,
          sourceLabel: null,
          createdAt: new Date().toISOString(),
          processedAt: null,
          isCurrent: true,
        },
      };

      setDocs((prev) => [optimisticDoc, ...prev]);
      closeUploadModal();

      // Immediately fetch the real record to replace the optimistic entry
      try {
        const real = await apiGetDocument(projectId, uploadResult.documentId);
        setDocs((prev) =>
          prev.map((d) => (d.id === real.id ? { ...real } : d))
        );
      } catch {
        // Polling will correct the state in the next interval
      }
    } catch (err: unknown) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed. Please try again.");
      setIsUploading(false);
    }
  };

  // ── Brain rebuild handler ─────────────────────────────────────────────────────

  const handleRebuildBrain = async () => {
    if (!projectId || brainRebuildState === "queuing") return;

    setBrainRebuildState("queuing");
    try {
      await apiRebuildBrain(projectId);
      setBrainRebuildState("queued");
      brainRebuildTimer.current = setTimeout(() => setBrainRebuildState("idle"), 4000);
    } catch {
      setBrainRebuildState("error");
      brainRebuildTimer.current = setTimeout(() => setBrainRebuildState("idle"), 3000);
    }
  };

  // ── Reprocess handler ─────────────────────────────────────────────────────────

  const handleReprocess = async (docId: string) => {
    if (!projectId) return;
    try {
      await apiReprocessDocument(projectId, docId);
      // Optimistically mark as pending so polling takes over
      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId
            ? { ...d, parseStatus: "pending", currentVersion: d.currentVersion ? { ...d.currentVersion, status: "pending" } : null }
            : d
        )
      );
    } catch {
      // silent — user can retry manually
    }
  };

  // ── Open viewer ───────────────────────────────────────────────────────────────

  const handleOpenViewer = (docId: string) => {
    if (projectId) {
      navigate(`/projects/${projectId}/docs/${docId}/view`);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <section className="relative h-full overflow-y-auto bg-[#f0efe8]">
      <div className="flex min-h-full">
        <div className="flex-1 px-12 py-10">
          <div className="max-w-[920px]">
            {/* Header */}
            <div>
              <p className="mb-2 font-bebas text-[11px] tracking-[0.18em] text-[#8b7fd4]">MEMORY</p>
              <h1 className="font-bebas text-[56px] leading-none text-[#0a0a0a]">PROJECT MEMORY</h1>
              <div className="mt-3 flex items-center gap-2">
                <span className="h-[3px] w-10 rounded-full bg-[#8b7fd4]" />
                <span className="h-[3px] w-5 rounded-full bg-[#e5e5e0]" />
              </div>
              <p className="mb-10 mt-4 max-w-[760px] font-syne text-[15px] leading-7 text-[#888888]">
                Search decisions, changes, client messages, briefs, and source material from one evidence trail.
              </p>
            </div>

            {/* Search bar */}
            <div className="mb-10 flex h-16 items-center gap-4 rounded-[20px] border-[1.5px] border-[rgba(255,255,255,0.9)] bg-[rgba(255,255,255,0.7)] px-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-[20px]">
              <div className="flex-shrink-0 text-[#bbbbbb]">
                <SearchIcon className="h-5 w-5" />
              </div>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filter by title, kind, or visibility…"
                className="min-w-0 flex-1 bg-transparent font-syne text-[15px] text-[#333333] outline-none placeholder:text-[#aaaaaa]"
              />
              <span className="rounded-lg border border-[#e5e5e0] bg-[rgba(0,0,0,0.04)] px-[10px] py-1 font-mono text-[12px] text-[#bbbbbb]">
                CMD K
              </span>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex overflow-x-auto border-b border-[#e5e5e0]">
              {tabOptions.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "border-b-2 px-5 py-3 font-bebas text-[12px] tracking-[0.12em] transition-colors",
                      active
                        ? "border-[#8b7fd4] text-[#0a0a0a]"
                        : "border-transparent text-[#888888] hover:text-[#333333]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Brain rebuild banner */}
            <AnimatePresence>
              {brainRebuildState !== "idle" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 overflow-hidden rounded-xl border border-[#e5e5e0] bg-white px-5 py-3"
                >
                  <p className="font-bebas text-[13px] tracking-[0.08em] text-[#0a0a0a]">
                    {brainRebuildState === "queuing" && "QUEUEING BRAIN REBUILD…"}
                    {brainRebuildState === "queued" && "✓ BRAIN REBUILD QUEUED — WORKER WILL PROCESS SHORTLY"}
                    {brainRebuildState === "error" && "BRAIN REBUILD FAILED — TRY AGAIN"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="mb-4 font-bebas text-[11px] tracking-[0.18em] text-[#888888]">SOURCE DOCUMENTS</p>

            {/* Loading state */}
            {docsLoading && (
              <div className="space-y-px">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={[
                      "border border-[#e8e8e4] bg-white px-6 py-5",
                      i === 0 ? "rounded-t-[16px]" : i === 2 ? "rounded-b-[16px]" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-11 w-11 animate-pulse rounded-xl bg-[#f4f4f5]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-2/3 animate-pulse rounded bg-[#f4f4f5]" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-[#f4f4f5]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {!docsLoading && docsError && (
              <div className="rounded-[16px] border border-[#fde8e8] bg-white px-6 py-6">
                <p className="font-bebas text-[14px] tracking-[0.08em] text-[#e05555]">FAILED TO LOAD DOCUMENTS</p>
                <p className="mt-1 font-syne text-[13px] text-[#888888]">{docsError}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!projectId) return;
                    setDocsLoading(true);
                    setDocsError(null);
                    apiListDocuments(projectId)
                      .then(({ items }) => { setDocs(items); setDocsLoading(false); })
                      .catch((err: unknown) => {
                        setDocsError(err instanceof ApiError ? err.message : "Failed to load documents.");
                        setDocsLoading(false);
                      });
                  }}
                  className="mt-4 rounded-xl border border-[#e5e5e0] bg-white px-4 py-2 font-bebas text-[12px] tracking-[0.08em] text-[#0a0a0a] transition-colors hover:border-[#0a0a0a]"
                >
                  RETRY
                </button>
              </div>
            )}

            {/* Document list */}
            {!docsLoading && !docsError && (
              <AnimatePresence mode="popLayout">
                {visibleDocs.length > 0 ? (
                  <div>
                    {visibleDocs.map((doc, index) => (
                      <DocCard
                        key={doc.id}
                        doc={doc}
                        index={index}
                        total={visibleDocs.length}
                        isManager={isManager}
                        onOpenViewer={handleOpenViewer}
                        onRebuildBrain={() => void handleRebuildBrain()}
                        onReprocess={(id) => void handleReprocess(id)}
                      />
                    ))}
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[16px] border border-[#e8e8e4] bg-white px-6 py-8"
                  >
                    {docs.length === 0 ? (
                      <>
                        <p className="font-bebas text-[16px] tracking-[0.08em] text-[#0a0a0a]">NO DOCUMENTS YET</p>
                        <p className="mt-2 font-syne text-[13px] text-[#888888]">
                          {isManager
                            ? "Upload your first PRD or SRS to start building project memory."
                            : "No documents have been uploaded to this project yet."}
                        </p>
                        {isManager && (
                          <button
                            type="button"
                            onClick={() => setIsUploadOpen(true)}
                            className="mt-4 rounded-xl bg-[#0a0a0a] px-5 py-2.5 font-bebas text-[13px] tracking-[0.08em] text-white transition-colors hover:bg-[#111827]"
                          >
                            UPLOAD FIRST DOCUMENT
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-bebas text-[16px] tracking-[0.08em] text-[#0a0a0a]">NO MATCHES</p>
                        <p className="mt-2 font-syne text-[13px] text-[#888888]">
                          Try a different query or switch tabs.
                        </p>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Upload FAB — only for manager */}
      {isManager && (
        <motion.button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          whileHover={{ scale: 1.04, backgroundColor: "#111827" }}
          whileTap={{ scale: 0.98 }}
          className="fixed bottom-8 z-20 inline-flex items-center gap-2 rounded-full bg-[#0a0a0a] px-6 py-[14px] font-bebas text-[14px] tracking-[0.08em] text-white shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
          style={{ right: "340px" }}
        >
          <UploadIcon className="h-4 w-4" />
          UPLOAD
        </motion.button>
      )}

      {/* Upload modal */}
      <AnimatePresence>
        {isUploadOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeUploadModal}
            className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[440px] rounded-2xl bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
            >
              <p className="font-bebas text-[20px] tracking-[0.06em] text-[#0a0a0a]">UPLOAD DOCUMENT</p>
              <p className="mb-5 mt-2 font-syne text-[13px] text-[#888888]">
                Add a file to the project docs library. Parsing happens automatically.
              </p>

              {/* Drop zone */}
              <div
                role="presentation"
                onDragOver={(event) => { event.preventDefault(); setIsDropActive(true); }}
                onDragLeave={() => setIsDropActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed bg-[#fafaf8] px-6 py-8 text-center transition-colors"
                style={{
                  borderColor: isDropActive ? "#111827" : "#e5e5e0",
                  background: isDropActive ? "rgba(17,24,39,0.04)" : "#fafaf8",
                }}
              >
                <div className="flex justify-center text-[#cccccc]">
                  <UploadCloudIcon className="h-8 w-8" />
                </div>

                {selectedFile ? (
                  <>
                    <p className="mt-3 font-syne text-[14px] font-semibold text-[#0a0a0a]">{selectedFile.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-[#bbbbbb]">{formatFileSize(selectedFile.size)}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 font-syne text-[14px] text-[#888888]">Drop files here</p>
                    <p className="mt-1 font-syne text-[12px] text-[#111827] underline">or click to browse</p>
                    <p className="mt-2 font-mono text-[11px] text-[#bbbbbb]">PDF · DOCX · TXT · MP3 · MP4 · PNG · JPG</p>
                  </>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md,.mp3,.mp4,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              {/* Kind selector */}
              <div className="mt-5">
                <p className="mb-2 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">DOCUMENT TYPE</p>
                <div className="grid grid-cols-4 gap-2">
                  {UPLOAD_KINDS.map((kind) => {
                    const active = selectedKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setSelectedKind(kind)}
                        className={[
                          "rounded-xl border px-2 py-3 text-center font-bebas text-[10px] tracking-[0.1em] transition-colors",
                          active
                            ? "border-[#111827] bg-[rgba(17,24,39,0.06)] text-[#0a0a0a]"
                            : "border-[#e5e5e0] bg-white text-[#666666] hover:border-[#111827]",
                        ].join(" ")}
                      >
                        {KIND_LABELS[kind]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Upload error */}
              {uploadError && (
                <p className="mt-4 rounded-xl bg-[#fff0f0] px-4 py-2 font-syne text-[12px] text-[#e05555]">
                  {uploadError}
                </p>
              )}

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeUploadModal}
                  disabled={isUploading}
                  className="font-syne text-[13px] text-[#888888] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedFile || !selectedKind || isUploading}
                  onClick={() => void handleUpload()}
                  className="rounded-xl bg-[#0a0a0a] px-5 py-2.5 font-bebas text-[13px] tracking-[0.08em] text-white transition-colors hover:bg-[#111827] disabled:cursor-not-allowed disabled:bg-[#cfcfcb]"
                >
                  {isUploading ? "UPLOADING…" : "UPLOAD"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
