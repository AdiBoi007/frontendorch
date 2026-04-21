import mermaid from "mermaid";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Avatar from "../components/ui/Avatar";
import { ArrowRightIcon, GitBranchIcon, GitMergeIcon, UsersIcon } from "../components/ui/AppIcons";
import { getLiveDoc, saveLiveDocSection } from "../lib/api";
import type { LiveDocComment, LiveDocPayload, LiveDocSection } from "../lib/types";
import { useParams } from "react-router-dom";

type SectionDrafts = Record<string, string>;
type DiagramKey = "system" | "usecase" | "flowchart" | "sequence";
type DiagramStatus = "loading" | "done" | null;
type DiagramState = Record<DiagramKey, DiagramStatus>;
type DiagramTimestampState = Record<DiagramKey, string | null>;

const initialDiagramState: DiagramState = {
  system: "done",
  usecase: null,
  flowchart: null,
  sequence: null
};

const systemDiagram = `
graph TD
  A([Buyer App]) -->|places order| B[API Gateway]
  B --> C[Order Service]
  C -->|assigns| D[Driver Assignment]
  C -->|notifies| E[Florist Dashboard]
  C -->|charges| F([Stripe Connect])
  D -->|availability check| G([Driver API])
  E -->|confirms| D
  D -->|dispatched| H[Notifications]
  H -->|SMS/Push| A
  B -->|admin access| I[Admin Panel]
  I -->|approves| D
  
  style A fill:#c8f0e8,stroke:#00b4a0,color:#0a0a0a
  style F fill:#c8f0e8,stroke:#00b4a0,color:#0a0a0a
  style G fill:#fceee4,stroke:#f59340,color:#0a0a0a
  style B fill:#f0faf8,stroke:#00b4a0,color:#0a0a0a
  style C fill:#f0faf8,stroke:#00b4a0,color:#0a0a0a
  style D fill:#fff0f0,stroke:#e05555,color:#0a0a0a
  style E fill:#f0faf8,stroke:#00b4a0,color:#0a0a0a
  style H fill:#f0faf8,stroke:#00b4a0,color:#0a0a0a
  style I fill:#e0dbf5,stroke:#8b7fd4,color:#0a0a0a
`;

const useCaseDiagram = `
graph LR
  Buyer([Buyer])
  Florist([Florist])
  Driver([Driver])
  Admin([Admin])
  
  subgraph BloomFast System
    UC1[Browse & Search]
    UC2[Place Order]
    UC3[Track Delivery]
    UC4[Make Payment]
    UC5[Manage Orders]
    UC6[Accept/Reject]
    UC7[View Inventory]
    UC8[Confirm Pickup]
    UC9[Update Location]
    UC10[Approve Assignment]
    UC11[Resolve Exceptions]
  end
  
  Buyer --> UC1
  Buyer --> UC2
  Buyer --> UC3
  Buyer --> UC4
  Florist --> UC5
  Florist --> UC6
  Florist --> UC7
  Florist --> UC8
  Driver --> UC8
  Driver --> UC9
  Admin --> UC10
  Admin --> UC11
  
  style UC2 fill:#c8f0e8,stroke:#00b4a0
  style UC10 fill:#e0dbf5,stroke:#8b7fd4
  style UC11 fill:#fff0f0,stroke:#e05555
`;

const flowchartDiagram = `
flowchart TD
  A([Order Placed by Buyer]) --> B{Payment OK?}
  B -->|No| C[/Notify Buyer/]
  C --> A
  B -->|Yes| D[Create Order Record]
  D --> E{Driver Available?}
  E -->|No| F[Queue Order\nRetry every 2 min]
  F --> E
  E -->|Yes| G[Propose Assignment]
  G --> H{Manager Approval?}
  H -->|Rejected| I[Re-queue\nFind New Driver]
  I --> E
  H -->|Approved| J[Assign Driver]
  J --> K[Notify Florist]
  K --> L{Florist Confirms?}
  L -->|No| M[Escalate to Admin]
  L -->|Yes| N[Driver Dispatched]
  N --> O[Real-time Tracking Active]
  O --> P([Delivery Complete])
  
  style A fill:#c8f0e8,stroke:#00b4a0
  style P fill:#c8f0e8,stroke:#00b4a0
  style B fill:#fceee4,stroke:#f59340
  style E fill:#fceee4,stroke:#f59340
  style H fill:#fceee4,stroke:#f59340
  style L fill:#fceee4,stroke:#f59340
  style M fill:#fff0f0,stroke:#e05555
`;

const sequenceDiagram = `
sequenceDiagram
  autonumber
  actor B as Buyer
  participant API as API Gateway
  participant OS as Order Service
  participant S as Stripe
  participant F as Florist App
  participant DA as Driver Assignment
  participant D as Driver App
  
  B->>API: Place Order
  API->>S: Charge Payment
  S-->>API: Payment OK
  API->>OS: Create Order
  OS->>DA: Request Driver
  DA->>DA: Check Availability
  DA->>OS: Driver Found
  OS->>F: New Order Alert
  F-->>OS: Confirmed
  OS->>DA: Approve Assignment
  DA->>D: Dispatch Notification
  D-->>DA: En Route
  DA->>OS: Status Update
  OS->>B: SMS — Driver En Route
  D->>OS: Delivered
  OS->>B: SMS — Delivered
  OS->>S: Trigger Payout
`;

const sectionListVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03
    }
  }
} as const;

const sectionItemVariants = {
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

const commentListVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05
    }
  }
} as const;

const commentItemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
} as const;

const sourceIndicatorMotion = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.15
    }
  }
} as const;

const diagramActions = [
  {
    key: "system" as const,
    label: "SYSTEM DIAGRAM",
    triggerLabel: "GENERATE SYSTEM DIAGRAM",
    subtitle: "Ask Socrates to render a system architecture diagram",
    chart: systemDiagram,
    accent: "#00b4a0",
    icon: GitBranchIcon,
    hoverClass: "hover:border-[#00b4a0] hover:bg-[rgba(0,180,160,0.04)]"
  },
  {
    key: "usecase" as const,
    label: "USE CASE DIAGRAM",
    triggerLabel: "GENERATE USE CASE DIAGRAM",
    subtitle: "Ask Socrates to render a use case diagram",
    chart: useCaseDiagram,
    accent: "#8b7fd4",
    icon: UsersIcon,
    hoverClass: "hover:border-[#8b7fd4] hover:bg-[rgba(139,127,212,0.04)]"
  },
  {
    key: "flowchart" as const,
    label: "FLOWCHART",
    triggerLabel: "GENERATE FLOWCHART",
    subtitle: "Ask Socrates to render a process flowchart",
    chart: flowchartDiagram,
    accent: "#f59340",
    icon: GitMergeIcon,
    hoverClass: "hover:border-[#f59340] hover:bg-[rgba(245,147,64,0.04)]"
  },
  {
    key: "sequence" as const,
    label: "SEQUENCE DIAGRAM",
    triggerLabel: "GENERATE SEQUENCE DIAGRAM",
    subtitle: "Ask Socrates to render an interaction sequence diagram",
    chart: sequenceDiagram,
    accent: "#8b7fd4",
    icon: GitBranchIcon,
    hoverClass: "hover:border-[#8b7fd4] hover:bg-[rgba(139,127,212,0.04)]"
  }
] as const;

function formatDiagramTimestamp() {
  return new Date()
    .toLocaleString("en-AU", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit"
    })
    .toUpperCase();
}

function sectionValue(section: LiveDocSection, drafts: SectionDrafts) {
  return drafts[section.id] ?? section.content;
}

function updateHighlight(section: LiveDocSection, content: string): LiveDocSection {
  if (!section.highlight) {
    return { ...section, content };
  }

  const nextStart = content.indexOf(section.highlight.text);
  if (nextStart === -1) {
    return { ...section, content };
  }

  return {
    ...section,
    content,
    highlight: {
      ...section.highlight,
      start: nextStart,
      end: nextStart + section.highlight.text.length
    }
  };
}

function MermaidDiagram({ chart, id }: { chart: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(`diagram-${id}-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    let isCancelled = false;

    const renderDiagram = async () => {
      if (!ref.current) {
        return;
      }

      ref.current.innerHTML = "";

      try {
        const { svg, bindFunctions } = await mermaid.render(renderIdRef.current, chart);
        if (!ref.current || isCancelled) {
          return;
        }

        ref.current.innerHTML = svg;
        bindFunctions?.(ref.current);
      } catch (error) {
        if (ref.current && !isCancelled) {
          ref.current.innerHTML =
            '<div class="flex min-h-[200px] items-center justify-center font-mono text-[12px] text-[#888888]">Unable to render diagram.</div>';
        }

        console.error("Mermaid render failed", error);
      }
    };

    void renderDiagram();

    return () => {
      isCancelled = true;
    };
  }, [chart]);

  return <div ref={ref} className="w-full overflow-x-auto [&_svg]:h-auto [&_svg]:w-full" style={{ minHeight: 200 }} />;
}

function renderHighlightedContent({
  section,
  value,
  tooltipSource,
  onHighlightClick
}: {
  section: LiveDocSection;
  value: string;
  tooltipSource: string | null;
  onHighlightClick: (event: ReactMouseEvent<HTMLSpanElement>) => void;
}) {
  if (!section.highlight) {
    return value;
  }

  let start = section.highlight.start;
  let end = section.highlight.end;

  if (value.slice(start, end) !== section.highlight.text) {
    const fallbackStart = value.indexOf(section.highlight.text);
    if (fallbackStart === -1) {
      return value;
    }

    start = fallbackStart;
    end = fallbackStart + section.highlight.text.length;
  }

  return (
    <>
      {value.slice(0, start)}
      <span
        data-source-tooltip-anchor="true"
        onClick={onHighlightClick}
        className="relative inline-block cursor-pointer rounded-[3px] bg-[#fff9c4] px-[2px] py-[1px] transition-colors hover:bg-[#fff3a0]"
      >
        {value.slice(start, end)}

        <AnimatePresence>
          {tooltipSource ? (
            <motion.span
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-max max-w-[320px] -translate-x-1/2 rounded-lg bg-[#0a0a0a] px-[10px] py-[6px] text-center font-syne text-[11px] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            >
              SOURCE: {tooltipSource}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
      {value.slice(end)}
    </>
  );
}

function DiagramLoadingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 flex h-[200px] w-full items-center justify-center rounded-2xl border border-[#e8e8e4] px-6"
      style={{
        background: "linear-gradient(90deg, #f5f4f0, #eeede8, #f5f4f0)",
        backgroundSize: "200% 100%",
        animation: "live-doc-diagram-shimmer 1.5s linear infinite"
      }}
    >
      <span className="font-mono text-[12px] text-[#888888]">Generating diagram...</span>
    </motion.div>
  );
}

function DiagramCard({
  diagramKey,
  label,
  accent,
  icon: Icon,
  chart,
  timestamp,
  onRegenerate,
  onCopySvg,
  mermaidReady
}: {
  diagramKey: DiagramKey;
  label: string;
  accent: string;
  icon: typeof GitBranchIcon;
  chart: string;
  timestamp: string | null;
  onRegenerate: () => void;
  onCopySvg: (diagramKey: DiagramKey) => void;
  mermaidReady: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-center justify-between border-b border-[#f0f0ec] px-5 py-[14px]">
        <div className="flex items-center gap-2">
          <span style={{ color: accent }}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="font-bebas text-[12px] tracking-[0.12em] text-[#0a0a0a]">{label}</span>
        </div>

        <div className="flex items-center">
          <button type="button" onClick={onRegenerate} className="font-syne text-[11px] text-[#888888] transition-colors hover:text-[#00b4a0]">
            REGENERATE
          </button>
          <button
            type="button"
            onClick={() => onCopySvg(diagramKey)}
            className="ml-2 rounded-lg border border-[#e8e8e4] px-2 py-[3px] font-mono text-[10px] text-[#888888]"
          >
            COPY SVG
          </button>
        </div>
      </div>

      <div id={`mermaid-container-${diagramKey}`} className="min-h-[220px] px-5 py-5">
        {mermaidReady ? <MermaidDiagram chart={chart} id={diagramKey} /> : <div className="min-h-[220px]" />}
      </div>

      <div className="flex items-center justify-between bg-[#fafaf8] px-5 py-[10px]">
        <span className="font-mono text-[9px] tracking-[0.14em] text-[#bbbbbb]">GENERATED FROM BRAIN + ACCEPTED CHANGES</span>
        <span className="font-mono text-[9px] text-[#bbbbbb]">{timestamp}</span>
      </div>
    </motion.div>
  );
}

function CommentCard({
  comment,
  active,
  registerRef
}: {
  comment: LiveDocComment;
  active: boolean;
  registerRef: (id: string, node: HTMLDivElement | null) => void;
}) {
  return (
    <motion.div
      ref={(el) => registerRef(comment.id, el)}
      variants={commentItemVariants}
      animate={{ borderColor: active ? "#00b4a0" : "#e8e8e4" }}
      transition={{ duration: 0.2 }}
      className={[
        "rounded-2xl border bg-white p-4",
        active ? "shadow-[0_0_0_3px_rgba(0,180,160,0.12)]" : ""
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0">
          <Avatar seed={comment.authorName} size={32} name={comment.authorName} />
        </div>

        <p className="min-w-0 flex-1 truncate font-syne text-[13px] font-semibold text-[#0a0a0a]">{comment.authorName}</p>
        <p className="text-right font-mono text-[11px] text-[#888888]">
          <span>{comment.time}</span>
          <br />
          <span>{comment.date}</span>
        </p>
      </div>

      <p className="mt-[10px] font-syne text-[13px] leading-[1.6] text-[#444444]">{comment.content}</p>

      <div className="mt-[10px]">
        <p className="font-mono text-[10px] text-[#888888]">Source:</p>
        <p className="mt-1 font-mono text-[10px] italic text-[#888888]">{comment.source}</p>
      </div>
    </motion.div>
  );
}

export function LiveDocPage() {
  const { id = "1" } = useParams();
  const [payload, setPayload] = useState<LiveDocPayload | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<SectionDrafts>({});
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [tooltipSectionId, setTooltipSectionId] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<DiagramState>(initialDiagramState);
  const [diagramTimestamps, setDiagramTimestamps] = useState<DiagramTimestampState>({
    system: formatDiagramTimestamp(),
    usecase: null,
    flowchart: null,
    sequence: null
  });
  const [mermaidReady, setMermaidReady] = useState(false);
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const diagramTimeoutsRef = useRef<Partial<Record<DiagramKey, number>>>({});

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true
      },
      themeVariables: {
        primaryColor: "#c8f0e8",
        primaryTextColor: "#0a0a0a",
        primaryBorderColor: "#00b4a0",
        lineColor: "#00b4a0",
        secondaryColor: "#e0dbf5",
        tertiaryColor: "#fceee4",
        background: "#ffffff",
        mainBkg: "#f0faf8",
        nodeBorder: "#00b4a0",
        clusterBkg: "#fafaf8",
        titleColor: "#0a0a0a",
        edgeLabelBackground: "#ffffff",
        fontFamily: "DM Mono, monospace",
        fontSize: "13px"
      }
    });
    setMermaidReady(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      const nextPayload = await getLiveDoc(id);
      if (isCancelled) {
        return;
      }

      setPayload(nextPayload);
      setDrafts({});
      setEditMode(false);
      setFocusedSectionId(null);
      setHoveredSectionId(null);
      setActiveSection(null);
      setActiveComment(null);
      setTooltipSectionId(null);
      setDiagrams(initialDiagramState);
      setDiagramTimestamps({
        system: formatDiagramTimestamp(),
        usecase: null,
        flowchart: null,
        sequence: null
      });
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-source-section="true"]')) {
        setActiveSection(null);
        setActiveComment(null);
      }

      if (!target?.closest('[data-source-tooltip-anchor="true"]')) {
        setTooltipSectionId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(diagramTimeoutsRef.current).forEach((timeoutId) => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
    };
  }, []);

  const handleSectionChange = (sectionId: string, content: string) => {
    setDrafts((current) => ({
      ...current,
      [sectionId]: content
    }));
  };

  const handleSaveSection = async (sectionId: string) => {
    const section = payload?.sections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }

    const nextContent = sectionValue(section, drafts);
    await saveLiveDocSection(id, sectionId, nextContent);

    setPayload((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        sections: current.sections.map((item) => (item.id === sectionId ? updateHighlight(item, nextContent) : item))
      };
    });

    setDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[sectionId];
      return nextDrafts;
    });
    setFocusedSectionId(null);
  };

  const handleSectionSourceClick = (section: LiveDocSection) => {
    if (section.sourceIds.length === 0) {
      return;
    }

    const commentId = section.sourceIds[0];
    setActiveSection(section.id);
    setActiveComment(commentId);

    window.setTimeout(() => {
      commentRefs.current[commentId]?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 50);
  };

  const handleGenerateDiagram = (key: DiagramKey) => {
    const existingTimeout = diagramTimeoutsRef.current[key];
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    setDiagrams((current) => ({
      ...current,
      [key]: "loading"
    }));

    diagramTimeoutsRef.current[key] = window.setTimeout(() => {
      setDiagrams((current) => ({
        ...current,
        [key]: "done"
      }));
      setDiagramTimestamps((current) => ({
        ...current,
        [key]: formatDiagramTimestamp()
      }));
    }, 2000);
  };

  const handleCopySvg = async (key: DiagramKey) => {
    const svg = document.querySelector(`#mermaid-container-${key} svg`) as SVGElement | null;
    if (!svg || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(svg.outerHTML);
    } catch {
      // Ignore clipboard failures in the mock viewer.
    }
  };

  if (!payload) {
    return <section className="h-full bg-[#f5f4f0]" />;
  }

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#f5f4f0]">
      <style>{`
        @keyframes live-doc-diagram-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div className="flex h-12 shrink-0 items-center border-b-[1.5px] border-[#e8e8e4] bg-white px-6">
        <h1 className="font-syne text-[15px] font-semibold text-[#0a0a0a]">{payload.projectName} — Product requirements</h1>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto bg-white">
          <div className="px-14 py-12 pl-[140px]">
            <div className="mb-5 flex items-center justify-between gap-4">
              <p className="font-mono text-[12px] text-[#888888]">
                {payload.docType} · {payload.version} · {payload.status}
              </p>

              <button
                type="button"
                onClick={() => {
                  setEditMode((current) => !current);
                  setFocusedSectionId(null);
                  setTooltipSectionId(null);
                }}
                className="rounded-lg border border-[#e8e8e4] px-3 py-1.5 font-syne text-[12px] text-[#555555] transition-colors hover:bg-[#f5f4f0]"
              >
                EDIT
              </button>
            </div>

            <motion.div variants={sectionListVariants} initial="hidden" animate="visible">
              {payload.sections.map((section) => {
                const currentValue = sectionValue(section, drafts);
                const isFocused = focusedSectionId === section.id;
                const isActive = activeSection === section.id;
                const isClickable = section.sourceIds.length > 0 && !editMode;
                const isEditable = editMode && (section.type === "body" || section.type === "highlighted");
                const tooltipSource =
                  tooltipSectionId === section.id
                    ? payload.comments.find((comment) => comment.id === section.sourceIds[0])?.source ?? null
                    : null;

                if (section.type === "title") {
                  return (
                    <motion.h2
                      key={section.id}
                      variants={sectionItemVariants}
                      className="mb-6 font-syne text-[28px] font-bold leading-[1.2] text-[#0a0a0a]"
                    >
                      {currentValue}
                    </motion.h2>
                  );
                }

                if (section.type === "section-heading") {
                  return (
                    <motion.div key={section.id} variants={sectionItemVariants} className="mb-3 mt-8">
                      <p className="font-syne text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888888]">
                        {section.sectionLabel}
                      </p>

                      {section.anchorId === "diagrams" ? (
                        <div className="mt-3 space-y-3">
                          {diagramActions.map((action) => {
                            const Icon = action.icon;
                            const status = diagrams[action.key];

                            return (
                              <div key={action.key}>
                                {status === "done" ? (
                                  <DiagramCard
                                    diagramKey={action.key}
                                    label={action.label}
                                    accent={action.accent}
                                    icon={Icon}
                                    chart={action.chart}
                                    timestamp={diagramTimestamps[action.key]}
                                    onRegenerate={() => handleGenerateDiagram(action.key)}
                                    onCopySvg={handleCopySvg}
                                    mermaidReady={mermaidReady}
                                  />
                                ) : null}

                                <motion.button
                                  type="button"
                                  onClick={() => handleGenerateDiagram(action.key)}
                                  whileHover={{ scale: 1.01 }}
                                  whileTap={{ scale: 0.995 }}
                                  className={[
                                    "w-full text-left transition-colors",
                                    status === "done"
                                      ? "rounded-xl border border-[#e8e8e4] bg-white px-4 py-3"
                                      : "rounded-xl border-[1.5px] border-dashed border-[#d0d0cc] px-5 py-4",
                                    action.hoverClass
                                  ].join(" ")}
                                >
                                  <div className="flex items-start gap-3">
                                    <span className="mt-0.5" style={{ color: action.accent }}>
                                      <Icon className="h-[18px] w-[18px]" />
                                    </span>
                                    <div>
                                      <p className="font-syne text-[13px] text-[#555555]">
                                        {status === "done" ? `REGENERATE ${action.label}` : action.triggerLabel}
                                      </p>
                                      <p className="mt-1 font-mono text-[11px] text-[#888888]">{action.subtitle}</p>
                                    </div>
                                  </div>
                                </motion.button>

                                {status === "loading" ? <DiagramLoadingCard /> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </motion.div>
                  );
                }

                return (
                  <motion.div key={section.id} variants={sectionItemVariants} className="relative mb-5">
                    {isEditable ? (
                      <div>
                        <textarea
                          value={currentValue}
                          onChange={(event) => handleSectionChange(section.id, event.target.value)}
                          onFocus={() => setFocusedSectionId(section.id)}
                          className="w-full resize-y rounded-xl border border-[#e8e8e4] px-[14px] py-3 font-syne text-[15px] leading-[1.8] text-[#333333] outline-none transition-colors focus:border-[#00b4a0]"
                          style={{ minHeight: 80 }}
                        />

                        <AnimatePresence>
                          {isFocused ? (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              className="mt-2 flex justify-end"
                            >
                              <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => void handleSaveSection(section.id)}
                                className="rounded-lg bg-[#00b4a0] px-[10px] py-1 font-bebas text-[11px] tracking-[0.08em] text-white"
                              >
                                SAVE
                              </button>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <motion.div
                        data-source-section={isClickable ? "true" : undefined}
                        onClick={() => {
                          if (!isClickable) {
                            return;
                          }

                          handleSectionSourceClick(section);
                          setTooltipSectionId(null);
                        }}
                        onMouseEnter={() => {
                          if (isClickable) {
                            setHoveredSectionId(section.id);
                          }
                        }}
                        onMouseLeave={() => {
                          if (hoveredSectionId === section.id) {
                            setHoveredSectionId(null);
                          }
                        }}
                        animate={
                          isActive
                            ? { backgroundColor: ["rgba(0,180,160,0.12)", "rgba(0,180,160,0.06)"] }
                            : { backgroundColor: "rgba(255,255,255,0)" }
                        }
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className={isClickable ? "cursor-pointer" : ""}
                        style={{
                          borderLeft: isActive ? "3px solid #00b4a0" : "3px solid transparent",
                          paddingLeft: isActive ? 16 : 0,
                          paddingRight: 16,
                          borderRadius: isActive ? "0 8px 8px 0" : 0
                        }}
                      >
                        <div className="relative">
                          <p className="font-syne text-[15px] leading-[1.8] text-[#444444]">
                            {section.type === "highlighted"
                              ? renderHighlightedContent({
                                  section,
                                  value: currentValue,
                                  tooltipSource,
                                  onHighlightClick: (event) => {
                                    event.stopPropagation();
                                    handleSectionSourceClick(section);
                                    setTooltipSectionId(section.id);
                                  }
                                })
                              : currentValue}
                          </p>

                          <AnimatePresence>
                            {isClickable && hoveredSectionId === section.id ? (
                              <motion.span
                                variants={sourceIndicatorMotion}
                                initial="hidden"
                                animate="visible"
                                exit="hidden"
                                className="pointer-events-none absolute left-[-132px] top-1/2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#00b4a0] px-[10px] py-1 font-syne text-[10px] font-semibold text-white"
                                style={{ transform: "translateY(-50%)" }}
                              >
                                VIEW SOURCE
                                <ArrowRightIcon className="h-3 w-3" />
                              </motion.span>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>

        <aside className="w-[340px] flex-shrink-0 overflow-y-auto border-l-[1.5px] border-[#e8e8e4] bg-[#f9f8f6] px-5 py-6">
          <p className="mb-5 font-bebas text-[11px] tracking-[0.18em] text-[#999999]">COMMENTS</p>

          <motion.div variants={commentListVariants} initial="hidden" animate="visible" className="space-y-3">
            {payload.comments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                active={activeComment === comment.id}
                registerRef={(commentId, node) => {
                  commentRefs.current[commentId] = node;
                }}
              />
            ))}
          </motion.div>
        </aside>
      </div>
    </section>
  );
}
