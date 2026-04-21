import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileTextIcon } from "../components/ui/AppIcons";
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
    return "font-bebas text-[32px] leading-none text-[#0a0a0a] mt-10 mb-4";
  }

  return "font-bebas text-[22px] leading-none text-[#0a0a0a] mt-8 mb-3";
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
  const { id = "1", docId = "1" } = useParams();
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
      const [projects, payload] = await Promise.all([getProjects(), getDocViewer(id, docId)]);
      if (isCancelled) {
        return;
      }

      const project = projects.find((item) => item.id === id) ?? projects[0];
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
  }, [docId, id]);

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
      const payload = await getAnchorProvenance(id, docId, selectedAnchor);
      if (provenanceRequestRef.current !== requestId) {
        return;
      }

      setProvenance(payload);
      setIsLoadingProvenance(false);
    };

    void load();
  }, [docId, id, selectedAnchor]);

  const activeSection = useMemo(
    () => viewer?.sections.find((section) => section.anchorId === selectedAnchor) ?? null,
    [selectedAnchor, viewer]
  );

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
            className="w-full rounded-xl border border-[#e5e5e0] bg-white px-4 py-3 font-syne text-[15px] text-[#333333] outline-none transition-colors focus:border-[#00b4a0]"
          />
        );
      }

      return <h2 className={renderHeadingLevel(section.level)}>{currentValue}</h2>;
    }

    if (section.type === "paragraph") {
      const interactive = !editMode && isChanged;
      const baseBorder = isCited ? "#00b4a0" : "#f59340";
      const baseBackground = isCited ? "rgba(0,180,160,0.04)" : "rgba(245,147,64,0.04)";
      const hoverBackground = isCited ? "rgba(0,180,160,0.08)" : "rgba(245,147,64,0.08)";
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
            className="w-full resize-y rounded-xl border border-[#e5e5e0] bg-white px-4 py-3 font-syne text-[14px] leading-[1.8] text-[#333333] outline-none transition-colors focus:border-[#00b4a0]"
            style={{ minHeight: 80 }}
          />
        );
      }

      return (
        <motion.div
          initial={isCited ? { backgroundColor: "rgba(0,180,160,0)" } : false}
          animate={isCited ? { backgroundColor: ["rgba(0,180,160,0)", "rgba(0,180,160,0.15)", "rgba(0,180,160,0.04)"] } : undefined}
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
            <span className="absolute right-0 top-0 rounded-full bg-[rgba(245,147,64,0.1)] px-2 py-[2px] font-bebas text-[9px] tracking-[0.18em] text-[#f59340]">
              CHANGED
            </span>
          ) : null}

          <p className="font-syne text-[15px] leading-[1.8] text-[#333333]">{currentValue}</p>

          {isSelected ? <span className="absolute inset-0 rounded-r-lg ring-1 ring-[rgba(0,180,160,0.15)]" /> : null}
        </motion.div>
      );
    }

    if (section.type === "list") {
      return (
        <ul className="mb-5 list-disc pl-5 font-syne text-[15px] leading-[1.8] text-[#333333]">
          {currentValue.split("\n").map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    }

    return (
      <pre className="mb-5 overflow-x-auto rounded-2xl bg-[#f0f0ec] p-4 font-mono text-[13px] leading-6 text-[#333333]">{currentValue}</pre>
    );
  };

  return (
    <section className="doc-viewer-root relative h-full overflow-hidden bg-[#f7f6f3]">
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

      <div className="doc-viewer-topbar absolute inset-x-0 top-0 z-10 flex h-[52px] items-center gap-4 border-b border-[rgba(0,0,0,0.06)] bg-[rgba(247,246,243,0.95)] px-8 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="font-syne text-[13px] text-[#888888] transition-colors hover:text-[#0a0a0a]"
          >
            ←
          </button>
          <span className="h-4 w-px bg-[#e5e5e0]" />
          <p className="truncate font-bebas text-[15px] text-[#0a0a0a]">{projectName.toUpperCase()}</p>
          <span className="font-syne text-[13px] text-[#cccccc]">/</span>
          <p className="truncate font-bebas text-[13px] tracking-[0.08em] text-[#00b4a0]">{viewer?.title.toUpperCase() ?? "DOCUMENT"}</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="rounded-full border border-[#e5e5e0] bg-[#f0f0ec] px-[10px] py-1 font-mono text-[11px] text-[#888888]">
            {viewer?.version ?? "v0.0"}
          </span>

          <motion.button
            type="button"
            whileHover={{ borderColor: "#00b4a0", color: "#00b4a0" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setEditMode((current) => !current)}
            className="rounded-xl border border-[#e5e5e0] px-[14px] py-[6px] font-syne text-[12px] text-[#555555]"
          >
            EDIT
          </motion.button>

          {editMode ? (
            <motion.button
              type="button"
              whileHover={{ backgroundColor: "#00b4a0" }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              className="rounded-xl bg-[#00b4a0] px-[14px] py-[6px] font-bebas text-[12px] tracking-[0.08em] text-white"
            >
              SAVE
            </motion.button>
          ) : null}

          <motion.button
            type="button"
            whileHover={{ backgroundColor: "#00b4a0" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => window.print()}
            className="rounded-xl bg-[#0a0a0a] px-[14px] py-[6px] font-bebas text-[12px] tracking-[0.08em] text-white"
          >
            EXPORT PDF
          </motion.button>
        </div>
      </div>

      <div className={["flex h-full pt-[52px]", selectedAnchor ? "pr-[360px]" : ""].join(" ")}>
        <div className="doc-viewer-document flex-1 overflow-y-auto">
          <div className="doc-viewer-content mx-auto max-w-[720px] px-12 pb-20 pt-[72px]">
            <div className="mb-10">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#f0faf8] text-[#00b4a0]">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-bebas text-[28px] leading-none text-[#0a0a0a]">{viewer?.title ?? "Loading Document"}</h1>
                    <span className="font-mono text-[12px] text-[#888888]">{viewer?.version}</span>
                  </div>
                  <p className="mt-2 font-syne text-[12px] text-[#888888]">
                    Uploaded by {viewer?.uploadedBy ?? "Unknown"} · {viewer?.uploadedAt ?? "Unknown"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-8 flex items-center gap-2 font-syne text-[12px] text-[#888888]">
              <span>Sections with</span>
              <span className="h-2 w-2 rounded-full bg-[#f59340]" />
              <span>have accepted changes. Click any section to see source evidence.</span>
            </div>

            <div className="mb-10 h-px bg-[#eeeeea]" />

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
            className="doc-viewer-provenance fixed bottom-0 right-0 top-0 z-30 w-[360px] overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.98)] p-6 shadow-[-8px_0_48px_rgba(0,0,0,0.1)] backdrop-blur-[20px]"
          >
            <div className="mb-5 flex items-center">
              <p className="font-bebas text-[13px] tracking-[0.12em] text-[#0a0a0a]">SOURCE EVIDENCE</p>
              <button
                type="button"
                onClick={() => setSelectedAnchor(null)}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f5f2] font-syne text-[16px] text-[#888888] transition-colors hover:bg-[#e5e5e0]"
              >
                ×
              </button>
            </div>

            {isLoadingProvenance ? (
              <p className="font-syne text-[13px] text-[#888888]">Loading source evidence…</p>
            ) : provenance ? (
              <>
                <div className="mb-5">
                  <p className="mb-2 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">CITED TEXT</p>
                  <p className="mb-2 font-mono text-[11px] text-[#bbbbbb]">{provenance.sourceDoc}</p>
                  <div className="rounded-r-lg bg-[rgba(245,147,64,0.04)] py-2 pl-3" style={{ borderLeft: "3px solid #f59340" }}>
                    <p className="font-syne text-[13px] italic leading-6 text-[#555555]">{provenance.excerpt}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-3 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">SOURCE MESSAGES</p>
                  {provenance.linkedMessages.map((message) => {
                    const badge = platformBadge(message.platform);

                    return (
                      <div key={message.id} className="mb-[10px] rounded-2xl border border-[#eeeeea] bg-white p-[14px]">
                        <div className="flex items-center">
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-full font-bebas text-[12px]"
                            style={{ background: badge.bg, color: badge.text }}
                          >
                            {badge.label}
                          </div>
                          <p className="ml-2 font-syne text-[12px] font-semibold text-[#0a0a0a]">{message.from}</p>
                          <p className="ml-auto font-mono text-[11px] text-[#888888]">{message.sentAt}</p>
                        </div>
                        <p
                          className="mt-2 font-syne text-[13px] italic leading-[1.6] text-[#555555]"
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
                  <p className="mb-3 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">ACCEPTED CHANGES</p>
                  {provenance.acceptedChanges.map((change) => (
                    <div key={change.id} className="mb-[10px] rounded-2xl border border-[rgba(0,180,160,0.2)] bg-[#f0faf8] p-[14px]">
                      <p className="font-syne text-[13px] font-semibold text-[#0a0a0a]">{change.summary}</p>
                      <div className="mt-2 flex items-center">
                        <span className="font-bebas text-[10px] tracking-[0.12em] text-[#00b4a0]">ACCEPTED</span>
                        <span className="ml-2 font-syne text-[11px] text-[#888888]">{change.acceptedBy}</span>
                        <span className="ml-auto font-mono text-[11px] text-[#888888]">{change.acceptedAt}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-6 w-full rounded-xl border-[1.5px] border-dashed border-[#d0d0cc] py-3 text-center font-syne text-[12px] text-[#888888] transition-colors hover:border-[#00b4a0] hover:bg-[rgba(0,180,160,0.04)] hover:text-[#00b4a0]"
                >
                  ASK SOCRATES ABOUT THIS SECTION
                </button>
              </>
            ) : (
              <div>
                <p className="font-syne text-[13px] text-[#888888]">No provenance available for this section.</p>
                {activeSection ? <p className="mt-2 font-syne text-[12px] text-[#bbbbbb]">{activeSection.content}</p> : null}
              </div>
            )}
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
