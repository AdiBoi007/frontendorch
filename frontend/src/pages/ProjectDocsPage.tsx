import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileTextIcon, SearchIcon, UploadCloudIcon, UploadIcon } from "../components/ui/AppIcons";
import { getDocs, uploadDoc } from "../lib/api";
import type { Doc } from "../lib/types";

type MemoryTab = "all" | "source-docs" | "communications" | "decisions" | "changes";

type TypeVisual = {
  bg: string;
  iconColor: string;
};

const tabOptions: Array<{ id: MemoryTab; label: string }> = [
  { id: "all", label: "ALL" },
  { id: "source-docs", label: "SOURCE DOCS" },
  { id: "communications", label: "COMMUNICATIONS" },
  { id: "decisions", label: "DECISIONS" },
  { id: "changes", label: "CHANGES" }
];

const uploadOptions: Array<{ id: Doc["type"]; label: string }> = [
  { id: "prd", label: "PRD" },
  { id: "srs", label: "SRS" },
  { id: "spec", label: "SPEC" },
  { id: "transcript", label: "TRANSCRIPT" },
  { id: "audio", label: "AUDIO" },
  { id: "image", label: "IMAGE" },
  { id: "change", label: "CHANGE" },
  { id: "decision", label: "DECISION" }
];

const typeVisuals: Record<Doc["type"], TypeVisual> = {
  prd: { bg: "#f0faf8", iconColor: "#00b4a0" },
  srs: { bg: "#f0faf8", iconColor: "#00b4a0" },
  spec: { bg: "#f4f2fc", iconColor: "#8b7fd4" },
  transcript: { bg: "#fef6ec", iconColor: "#f59340" },
  audio: { bg: "#fef6ec", iconColor: "#f59340" },
  image: { bg: "#fff0f8", iconColor: "#e05590" },
  change: { bg: "#fff0f0", iconColor: "#e05555" },
  decision: { bg: "#f4f2fc", iconColor: "#8b7fd4" }
};

const extensionMap: Record<Doc["type"], string> = {
  prd: ".pdf",
  srs: ".pdf",
  spec: ".pdf",
  transcript: ".txt",
  audio: ".mp3",
  image: ".png",
  change: ".md",
  decision: ".txt"
};

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getDocTab(doc: Doc): Exclude<MemoryTab, "all"> {
  if (doc.type === "change") {
    return "changes";
  }

  if (doc.type === "decision") {
    return "decisions";
  }

  if (doc.name === "Payment Flow Diagram") {
    return "changes";
  }

  if (doc.name === "Stakeholder Email Thread" || doc.name === "Client Kickoff Call") {
    return "decisions";
  }

  if (doc.type === "transcript" || doc.type === "audio") {
    return "communications";
  }

  return "source-docs";
}

function getFilename(doc: Doc) {
  return `${doc.name}${extensionMap[doc.type]}`;
}

export function ProjectMemoryPage() {
  const navigate = useNavigate();
  const { id = "1" } = useParams();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<MemoryTab>("all");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedUploadType, setSelectedUploadType] = useState<Doc["type"] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      const docItems = await getDocs(id);
      if (isCancelled) {
        return;
      }

      setDocs(docItems.map((item) => ({ ...item })));
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  const visibleDocs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return docs.filter((doc) => {
      const matchesTab = activeTab === "all" ? true : getDocTab(doc) === activeTab;
      if (!matchesTab) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [doc.name, doc.excerpt, doc.uploadedBy, doc.uploadedAt].some((value) => value.toLowerCase().includes(query));
    });
  }, [activeTab, docs, searchQuery]);

  const closeUploadModal = () => {
    setIsUploadOpen(false);
    setSelectedUploadType(null);
    setSelectedFile(null);
    setIsDropActive(false);
    setIsUploading(false);
  };

  const handleFileSelection = (file: File | null) => {
    if (!file) {
      return;
    }

    setSelectedFile(file);
    setIsDropActive(false);
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
    if (!selectedFile || !selectedUploadType) {
      return;
    }

    setIsUploading(true);
    const nextDoc = await uploadDoc(id, selectedFile, selectedUploadType);
    setDocs((current) => [{ ...nextDoc }, ...current]);
    closeUploadModal();
  };

  return (
    <section className="relative h-full overflow-y-auto bg-[#f0efe8]">
      <div className="flex min-h-full">
        <div className="flex-1 px-12 py-10">
          <div className="max-w-[920px]">
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

            <div
              className="mb-10 flex h-16 items-center gap-4 rounded-[20px] border-[1.5px] border-[rgba(255,255,255,0.9)] bg-[rgba(255,255,255,0.7)] px-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-[20px]"
            >
              <div className="flex-shrink-0 text-[#bbbbbb]">
                <SearchIcon className="h-5 w-5" />
              </div>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Ask anything about this project - decisions, changes, what the client said..."
                className="min-w-0 flex-1 bg-transparent font-syne text-[15px] text-[#333333] outline-none placeholder:text-[#aaaaaa]"
              />
              <span className="rounded-lg border border-[#e5e5e0] bg-[rgba(0,0,0,0.04)] px-[10px] py-1 font-mono text-[12px] text-[#bbbbbb]">
                CMD K
              </span>
            </div>

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
                      active ? "border-[#8b7fd4] text-[#0a0a0a]" : "border-transparent text-[#888888] hover:text-[#333333]"
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <p className="mb-4 font-bebas text-[11px] tracking-[0.18em] text-[#888888]">SOURCE DOCUMENTS</p>

            <AnimatePresence mode="popLayout">
              {visibleDocs.length > 0 ? (
                <div>
                  {visibleDocs.map((doc, index) => {
                    const visual = typeVisuals[doc.type];
                    const roundedClass =
                      visibleDocs.length === 1
                        ? "rounded-[16px]"
                        : index === 0
                          ? "rounded-t-[16px]"
                          : index === visibleDocs.length - 1
                            ? "rounded-b-[16px]"
                            : "";

                    return (
                      <motion.article
                        key={doc.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        className={[
                          "relative cursor-pointer border border-[#e8e8e4] bg-white px-6 py-5 transition-colors hover:bg-[#fafaf8]",
                          roundedClass,
                          index > 0 ? "-mt-px" : ""
                        ].join(" ")}
                        onClick={() => navigate(`/projects/${id}/docs/${doc.id}/view`)}
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
                              <p className="min-w-0 truncate font-syne text-[15px] font-semibold text-[#0a0a0a]">{doc.name}</p>
                              {doc.status === "processing" ? (
                                <motion.span
                                  className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f59340]"
                                  animate={{ scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }}
                                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                                />
                              ) : (
                                <span
                                  className="ml-auto h-1.5 w-1.5 rounded-full"
                                  style={{ background: doc.status === "ready" ? "#00b4a0" : "#e05555" }}
                                />
                              )}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center font-mono text-[12px] text-[#888888]">
                              <span>{getFilename(doc)}</span>
                              <span className="mx-[6px]">·</span>
                              <span>{doc.uploadedAt}</span>
                            </div>

                            <p
                              className="mt-[10px] font-syne text-[13px] leading-[1.6] text-[#555555]"
                              style={{
                                display: "-webkit-box",
                                overflow: "hidden",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 2
                              }}
                            >
                              {doc.excerpt}
                            </p>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[16px] border border-[#e8e8e4] bg-white px-6 py-8"
                >
                  <p className="font-bebas text-[16px] tracking-[0.08em] text-[#0a0a0a]">NO MEMORY FOUND</p>
                  <p className="mt-2 font-syne text-[13px] text-[#888888]">Try a different query or switch tabs.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={() => setIsUploadOpen(true)}
      whileHover={{ scale: 1.04, backgroundColor: "#00b4a0" }}
      whileTap={{ scale: 0.98 }}
      className="fixed bottom-8 z-20 inline-flex items-center gap-2 rounded-full bg-[#0a0a0a] px-6 py-[14px] font-bebas text-[14px] tracking-[0.08em] text-white shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      style={{ right: "340px" }}
    >
      <UploadIcon className="h-4 w-4" />
      UPLOAD
    </motion.button>

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
              className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
            >
              <p className="font-bebas text-[20px] tracking-[0.06em] text-[#0a0a0a]">UPLOAD DOCUMENT</p>
              <p className="mb-5 mt-2 font-syne text-[13px] text-[#888888]">Add a new file to the project docs library.</p>

              <div
                role="presentation"
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDropActive(true);
                }}
                onDragLeave={() => setIsDropActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed bg-[#fafaf8] px-6 py-8 text-center transition-colors"
                style={{
                  borderColor: isDropActive ? "#00b4a0" : "#e5e5e0",
                  background: isDropActive ? "rgba(0,180,160,0.04)" : "#fafaf8"
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
                    <p className="mt-1 font-syne text-[12px] text-[#00b4a0] underline">or click to browse</p>
                    <p className="mt-2 font-mono text-[11px] text-[#bbbbbb]">PDF · DOCX · TXT · MP3 · MP4 · PNG · JPG</p>
                  </>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.mp3,.mp4,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              <div className="mt-5">
                <p className="mb-2 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">DOCUMENT TYPE</p>
                <div className="grid grid-cols-4 gap-2">
                  {uploadOptions.map((option) => {
                    const active = selectedUploadType === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedUploadType(option.id)}
                        className={[
                          "rounded-xl border px-3 py-3 text-center font-bebas text-[11px] tracking-[0.1em] transition-colors",
                          active
                            ? "border-[#00b4a0] bg-[rgba(0,180,160,0.06)] text-[#0a0a0a]"
                            : "border-[#e5e5e0] bg-white text-[#666666] hover:border-[#00b4a0]"
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={closeUploadModal} className="font-syne text-[13px] text-[#888888]">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedFile || !selectedUploadType || isUploading}
                  onClick={() => void handleUpload()}
                  className="rounded-xl bg-[#0a0a0a] px-5 py-2.5 font-bebas text-[13px] tracking-[0.08em] text-white transition-colors hover:bg-[#00b4a0] disabled:cursor-not-allowed disabled:bg-[#cfcfcb]"
                >
                  UPLOAD
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
