import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, CloseIcon, FileTextIcon } from "../components/ui/AppIcons";
import { useSocrates } from "../context/SocratesContext";
import { getAnchorProvenance, getDocViewer, getProjects } from "../lib/api";
import type { AnchorProvenance, DocSection, DocViewerPayload } from "../lib/types";

type SectionDrafts = Record<string, string>;

const citedAnchorIds = ["driver-detail"];

const sectionStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03
    }
  }
} as const;

const sectionItem = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
} as const;

function platformBadge(platform: AnchorProvenance["linkedMessages"][number]["platform"]) {
  if (platform === "slack") {
    return {
      bg: "#4A154B20",
      text: "#4A154B",
      label: "S"
    };
  }

  if (platform === "email") {
    return {
      bg: "#1a73e820",
      text: "#1a73e8",
      label: "G"
    };
  }

  return {
    bg: "#25D36620",
    text: "#25D366",
    label: "W"
  };
}

function renderHeadingLevel(level: number | undefined) {
  if (level === 1) {
    return "font-sans text-[26px] font-bold leading-tight tracking-tight text-text1 mt-10 mb-4 md:text-[28px]";
  }

  return "font-sans text-xl font-bold leading-tight tracking-tight text-text1 mt-8 mb-3 md:text-[22px]";
}

function applyDrafts(viewer: DocViewerPayload, drafts: SectionDrafts): DocViewerPayload {
  return {
    ...viewer,
    sections: viewer.sections.map((section) => {
      const nextContent = drafts[section.id];
      if (nextContent === undefined) {
        return section;
      }

      return {
        ...section,
        content: nextContent
      };
    })
  };
}

function sectionValue(section: DocSection, drafts: SectionDrafts) {
  return drafts[section.id] ?? section.content;
}

export function LiveDocViewerPage() {
  const navigate = useNavigate();
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const { setSelection } = useSocrates();
  const provenanceRequestRef = useRef(0);

  const [projectName, setProjectName] = useState("PROJECT");
  const [viewer, setViewer] = useState<DocViewerPayload | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<AnchorProvenance | null>(null);
  const [isLoadingProvenance, setIsLoadingProvenance] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<SectionDrafts>({});

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!projectId || !docId) {
        return;
      }
      const [projects, payload] = await Promise.all([getProjects(), getDocViewer(projectId, docId)]);
      if (isCancelled) {
        return;
      }

      const project = projects.find((item) => item.id === projectId) ?? projects[0];
      setProjectName(project?.name ?? "PROJECT");
      setViewer(payload);
      setSelectedAnchor(null);
      setProvenance(null);
      setEditMode(false);
      setDrafts({});
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [docId, projectId]);

  useEffect(() => {
    if (!selectedAnchor) {
      setProvenance(null);
      setIsLoadingProvenance(false);
      return;
    }

    const requestId = provenanceRequestRef.current + 1;
    provenanceRequestRef.current = requestId;
    setIsLoadingProvenance(true);

    const load = async () => {
      if (!projectId || !docId) {
        return;
      }
      const payload = await getAnchorProvenance(projectId, docId, selectedAnchor);
      if (provenanceRequestRef.current !== requestId) {
        return;
      }

      setProvenance(payload);
      setIsLoadingProvenance(false);
    };

    void load();
  }, [docId, projectId, selectedAnchor]);

  const activeSection = useMemo(
    () => viewer?.sections.find((section) => section.anchorId === selectedAnchor) ?? null,
    [selectedAnchor, viewer]
  );

  useEffect(() => {
    if (!docId) {
      return;
    }

    if (!activeSection) {
      setSelection({
        selectedRefType: "document",
        selectedRefId: docId,
        viewerState: { documentId: docId },
      });
      return;
    }

    setSelection({
      selectedRefType: "document_section",
      selectedRefId: activeSection.id,
      viewerState: {
        documentId: docId,
        anchorId: activeSection.anchorId,
      },
    });
  }, [activeSection, docId, setSelection]);

  const handleSectionChange = (sectionId: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [sectionId]: value
    }));
  };

  const handleSave = () => {
    if (!viewer) {
      return;
    }

    // TODO: PATCH /v1/projects/:projectId/documents/:documentId
    setViewer(applyDrafts(viewer, drafts));
    setEditMode(false);
  };

  const renderSection = (section: DocSection) => {
    const currentValue = sectionValue(section, drafts);
    const isCited = citedAnchorIds.includes(section.anchorId);
    const isSelected = selectedAnchor === section.anchorId;
    const isChanged = section.hasChange;

    if (section.type === "heading") {
      if (editMode) {
        return (
          <input
            value={currentValue}
            onChange={(event) => handleSectionChange(section.id, event.target.value)}
            className="w-full rounded-lg border border-border bg-white px-4 py-3 font-sans text-doc text-textBody outline-none transition-colors focus:border-text1"
          />
        );
      }

      return <h2 className={renderHeadingLevel(section.level)}>{currentValue}</h2>;
    }

    if (section.type === "paragraph") {
      const interactive = !editMode && isChanged;
      const baseBorder = isCited ? "#111827" : "#f59340";
      const baseBackground = isCited ? "rgba(17,24,39,0.04)" : "rgba(245,147,64,0.04)";
      const hoverBackground = isCited ? "rgba(17,24,39,0.08)" : "rgba(245,147,64,0.08)";
      const highlightStyle =
        isChanged || isCited
          ? {
              borderLeft: `3px solid ${baseBorder}`,
              background: baseBackground,
              borderRadius: "0 8px 8px 0",
              paddingLeft: "16px"
            }
          : undefined;

      if (editMode) {
        return (
          <textarea
            value={currentValue}
            onChange={(event) => handleSectionChange(section.id, event.target.value)}
            className="w-full resize-y rounded-lg border border-border bg-white px-4 py-3 font-sans text-docSm leading-[1.75] text-textBody outline-none transition-colors focus:border-text1"
            style={{ minHeight: 80 }}
          />
        );
      }

      return (
        <motion.div
          initial={isCited ? { backgroundColor: "rgba(17,24,39,0)" } : false}
          animate={isCited ? { backgroundColor: ["rgba(17,24,39,0)", "rgba(17,24,39,0.15)", "rgba(17,24,39,0.04)"] } : undefined}
          transition={isCited ? { duration: 1.2, times: [0, 0.45, 1] } : undefined}
          className={[
            "relative mb-5 transition-colors",
            isChanged ? "doc-section--changed" : "",
            interactive ? "cursor-pointer" : ""
          ].join(" ")}
          style={highlightStyle}
          onClick={() => {
            if (!interactive) {
              return;
            }

            setSelectedAnchor(section.anchorId);
          }}
          onMouseEnter={(event) => {
            if (!interactive) {
              return;
            }

            event.currentTarget.style.background = hoverBackground;
          }}
          onMouseLeave={(event) => {
            if (!interactive) {
              return;
            }

            event.currentTarget.style.background = baseBackground;
          }}
        >
          {isChanged ? (
            <span className="absolute right-0 top-0 rounded-full bg-amber-50 px-2 py-[2px] font-sans text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              Changed
            </span>
          ) : null}

          <p className="font-sans text-doc leading-[1.75] text-textBody">{currentValue}</p>

          {isSelected ? <span className="absolute inset-0 rounded-r-lg ring-1 ring-[rgba(17,24,39,0.15)]" /> : null}
        </motion.div>
      );
    }

    if (section.type === "list") {
      return (
        <ul className="mb-5 list-disc pl-5 font-sans text-doc leading-[1.75] text-textBody">
          {currentValue.split("\n").map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    }

    return (
      <pre className="mb-5 overflow-x-auto rounded-lg bg-zinc-100 p-4 font-mono text-[13px] leading-6 text-textBody">{currentValue}</pre>
    );
  };

  return (
    <section className="doc-viewer-root relative h-full overflow-hidden bg-bg">
      <style>{`
        @media print {
          .doc-viewer-topbar,
          .doc-viewer-provenance {
            display: none !important;
          }

          .doc-viewer-root,
          .doc-viewer-document,
          .doc-viewer-content {
            background: white !important;
          }

          .doc-viewer-document {
            padding-top: 0 !important;
          }

          .doc-section--changed {
            background: transparent !important;
          }
        }
      `}</style>

      <div className="doc-viewer-topbar absolute inset-x-0 top-0 z-10 flex h-[52px] items-center gap-4 border-b border-border bg-bg/95 px-6 backdrop-blur-md md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-text2 transition-colors hover:text-text1"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <span className="h-4 w-px bg-border" />
          <p className="truncate font-sans text-meta font-medium text-text1">{projectName}</p>
          <span className="font-sans text-meta text-text3">/</span>
          <p className="truncate font-sans text-meta text-text2">{viewer?.title ?? "Document"}</p>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <span className="rounded-md border border-border bg-white px-2.5 py-1 font-mono text-[10px] text-text2">
            {viewer?.version ?? "v0.0"}
          </span>

          <motion.button
            type="button"
            whileHover={{ borderColor: "#111827", color: "#111827" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setEditMode((current) => !current)}
            className="rounded-md border border-border bg-white px-3 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-textBody"
          >
            Edit
          </motion.button>

          {editMode ? (
            <motion.button
              type="button"
              whileHover={{ opacity: 0.92 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              className="rounded-md bg-text1 px-3 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-white"
            >
              Save
            </motion.button>
          ) : null}

          <motion.button
            type="button"
            whileHover={{ opacity: 0.92 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => window.print()}
            className="rounded-md bg-text1 px-3 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-white"
          >
            Export PDF
          </motion.button>
        </div>
      </div>

      <div className={["flex h-full pt-[52px]", selectedAnchor ? "pr-[360px]" : ""].join(" ")}>
        <div className="doc-viewer-document flex-1 overflow-y-auto">
          <div className="doc-viewer-content mx-auto max-w-[720px] px-6 pb-20 pt-10 md:px-12 md:pt-14">
            <div className="mb-10">
              <p className="font-sans text-label font-semibold uppercase text-text2">Live document</p>
              <div className="mt-3 flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-text1">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-sans text-[26px] font-bold leading-tight tracking-tight text-text1 md:text-[28px]">
                      {viewer?.title ?? "Loading Document"}
                    </h1>
                    <span className="font-mono text-meta text-text2">{viewer?.version}</span>
                  </div>
                  <p className="mt-2 font-sans text-meta text-text2">
                    Uploaded by {viewer?.uploadedBy ?? "Unknown"} · {viewer?.uploadedAt ?? "Unknown"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-8 flex items-center gap-2 font-sans text-meta text-text2">
              <span>Sections with</span>
              <span className="h-2 w-2 rounded-full bg-[#f59340]" />
              <span>have accepted changes. Click any section to see source evidence.</span>
            </div>

            <div className="mb-10 h-px bg-border" />

            <motion.div initial="hidden" animate="visible" variants={sectionStagger}>
              {viewer?.sections.map((section) => (
                <motion.div
                  key={section.id}
                  variants={sectionItem}
                  className={section.hasChange ? "doc-section--changed" : undefined}
                >
                  {renderSection(section)}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedAnchor ? (
          <motion.aside
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="doc-viewer-provenance fixed bottom-0 right-0 top-0 z-30 w-[360px] overflow-y-auto border-l border-border bg-white p-6 shadow-sm"
          >
            <div className="mb-5 flex items-center">
              <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-text1">Source evidence</p>
              <button
                type="button"
                onClick={() => setSelectedAnchor(null)}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-text2 transition-colors hover:bg-zinc-200"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {isLoadingProvenance ? (
              <p className="font-sans text-[13px] text-text2">Loading source evidence…</p>
            ) : provenance ? (
              <>
                <div className="mb-5">
                  <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-text2">Cited text</p>
                  <p className="mb-2 font-mono text-[11px] text-text3">{provenance.sourceDoc}</p>
                  <div className="rounded-r-lg bg-amber-50/80 py-2 pl-3" style={{ borderLeft: "3px solid #d97706" }}>
                    <p className="font-sans text-[13px] italic leading-6 text-textBody">{provenance.excerpt}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-text2">Source messages</p>
                  {provenance.linkedMessages.map((message) => {
                    const badge = platformBadge(message.platform);

                    return (
                      <div key={message.id} className="mb-[10px] rounded-lg border border-border bg-white p-[14px]">
                        <div className="flex items-center">
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-full font-sans text-[11px] font-semibold"
                            style={{ background: badge.bg, color: badge.text }}
                          >
                            {badge.label}
                          </div>
                          <p className="ml-2 font-sans text-meta font-semibold text-text1">{message.from}</p>
                          <p className="ml-auto font-mono text-[11px] text-text2">{message.sentAt}</p>
                        </div>
                        <p
                          className="mt-2 font-sans text-[13px] italic leading-[1.6] text-textBody"
                          style={{
                            display: "-webkit-box",
                            overflow: "hidden",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 4
                          }}
                        >
                          {message.content}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5">
                  <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-text2">Accepted changes</p>
                  {provenance.acceptedChanges.map((change) => (
                    <div key={change.id} className="mb-[10px] rounded-lg border border-border bg-zinc-50 p-[14px]">
                      <p className="font-sans text-[13px] font-semibold text-text1">{change.summary}</p>
                      <div className="mt-2 flex items-center">
                        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text1">Accepted</span>
                        <span className="ml-2 font-sans text-[11px] text-text2">{change.acceptedBy}</span>
                        <span className="ml-auto font-mono text-[11px] text-text2">{change.acceptedAt}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-6 w-full rounded-lg border border-dashed border-border py-3 text-center font-sans text-meta text-text2 transition-colors hover:border-text1 hover:bg-zinc-50 hover:text-text1"
                >
                  Ask Socrates about this section
                </button>
              </>
            ) : (
              <div>
                <p className="font-sans text-[13px] text-text2">No provenance available for this section.</p>
                {activeSection ? <p className="mt-2 font-sans text-meta text-text3">{activeSection.content}</p> : null}
              </div>
            )}
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
