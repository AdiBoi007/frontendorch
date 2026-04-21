import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckSquareIcon, FileTextIcon, GitBranchIcon, MessageSquareIcon, UsersIcon } from "../components/ui/AppIcons";
import { mockProjectBrains, mockProjects } from "../lib/mockData";
import type { BrainCategoryId, BrainDetailItem, BrainIconKey, BrainNodeData } from "../lib/types";

type CanvasSize = {
  width: number;
  height: number;
};

type NodePosition = {
  x: number;
  y: number;
};

type NodePositions = Record<string, NodePosition>;

type UploadTypeId = "prd" | "srs" | "tech-spec" | "communication" | "decision" | "change-request";

type DetailStatus = {
  label: "ready" | "processing" | "pending";
  color: string;
};

const centerNodeSize = 96;
const categoryNodeSize = 60;
const edgeDrawLength = 400;

const nodeEnterTransition = {
  ease: [0.22, 1, 0.36, 1] as const
};

const hoverSpring = {
  type: "spring",
  stiffness: 400,
  damping: 20
} as const;

const subNodeSpring = {
  type: "spring",
  stiffness: 300,
  damping: 20
} as const;

const uploadTypeOptions = [
  { id: "prd", label: "PRD", emoji: "📄" },
  { id: "srs", label: "SRS", emoji: "📋" },
  { id: "tech-spec", label: "Tech Spec", emoji: "🔧" },
  { id: "communication", label: "Communication", emoji: "💬" },
  { id: "decision", label: "Decision", emoji: "✅" },
  { id: "change-request", label: "Change Request", emoji: "⚠️" }
] as const satisfies ReadonlyArray<{ id: UploadTypeId; label: string; emoji: string }>;

const uploadCategoryMap: Record<UploadTypeId, BrainCategoryId> = {
  prd: "docs",
  srs: "docs",
  "tech-spec": "docs",
  communication: "comms",
  decision: "decisions",
  "change-request": "changes"
};

const defaultUploadTypeByCategory: Partial<Record<BrainCategoryId, UploadTypeId>> = {
  docs: "prd",
  comms: "communication",
  changes: "change-request",
  decisions: "decision"
};

const categoryLayout = {
  core: { left: 50, top: 50 },
  docs: { left: 50, top: 18 },
  comms: { left: 76, top: 34 },
  team: { left: 74, top: 68 },
  changes: { left: 30, top: 72 },
  decisions: { left: 24, top: 36 }
} as const;

const categoryVisuals: Record<
  BrainCategoryId,
  {
    accent: string;
    tint: string;
    border: string;
    text: string;
    icon: BrainIconKey;
    typeLabel: string;
  }
> = {
  docs: {
    accent: "#00b4a0",
    tint: "#f0faf8",
    border: "rgba(0,180,160,0.2)",
    text: "#00806f",
    icon: "file-text",
    typeLabel: "DOC"
  },
  comms: {
    accent: "#8b7fd4",
    tint: "#f4f2fc",
    border: "rgba(139,127,212,0.2)",
    text: "#6b5dc4",
    icon: "message-square",
    typeLabel: "COMMS"
  },
  team: {
    accent: "#f59340",
    tint: "#fef6ec",
    border: "rgba(245,147,64,0.2)",
    text: "#c4650a",
    icon: "users",
    typeLabel: "TEAM"
  },
  changes: {
    accent: "#e05555",
    tint: "#fff0f0",
    border: "rgba(224,85,85,0.2)",
    text: "#c02020",
    icon: "git-branch",
    typeLabel: "CHANGE"
  },
  decisions: {
    accent: "#00b4a0",
    tint: "#f0faf8",
    border: "rgba(0,180,160,0.2)",
    text: "#00806f",
    icon: "check-square",
    typeLabel: "DECISION"
  }
};

const initialSubnodeOffsets: Record<BrainCategoryId, Record<string, { x: number; y: number }>> = {
  docs: {
    "PRD v2": { x: -70, y: -52 },
    SRS: { x: 60, y: -52 },
    "Tech Spec": { x: -10, y: -90 }
  },
  comms: {
    Slack: { x: 90, y: -30 },
    Gmail: { x: 95, y: 20 },
    WhatsApp: { x: 70, y: -75 }
  },
  team: {
    SC: { x: 85, y: -40 },
    MT: { x: 80, y: 30 },
    PK: { x: 30, y: 80 }
  },
  changes: {
    "Promo code": { x: -90, y: 20 },
    "Dark mode": { x: -85, y: -40 }
  },
  decisions: {
    "OAuth removed": { x: -95, y: 20 },
    "v1 scope locked": { x: -80, y: -45 }
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getInitialCanvasSize(): CanvasSize {
  if (typeof window === "undefined") {
    return { width: 1200, height: 780 };
  }

  return {
    width: Math.max(window.innerWidth, 1),
    height: Math.max(window.innerHeight - 56, 1)
  };
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3 ? normalized.split("").map((part) => `${part}${part}`).join("") : normalized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getIcon(icon: BrainIconKey | undefined, className = "h-5 w-5") {
  if (icon === "file-text") {
    return <FileTextIcon className={className} />;
  }

  if (icon === "message-square") {
    return <MessageSquareIcon className={className} />;
  }

  if (icon === "users") {
    return <UsersIcon className={className} />;
  }

  if (icon === "git-branch") {
    return <GitBranchIcon className={className} />;
  }

  if (icon === "check-square") {
    return <CheckSquareIcon className={className} />;
  }

  return null;
}

function getCategoryCountLabel(category: BrainCategoryId, count: number) {
  if (category === "docs") {
    return `${count} linked docs`;
  }

  if (category === "comms") {
    return `${count} active channels`;
  }

  if (category === "team") {
    return `${count} active members`;
  }

  if (category === "changes") {
    return `${count} open updates`;
  }

  return `${count} locked calls`;
}

function getInitialSubnodeOffset(category: BrainCategoryId, label: string) {
  return initialSubnodeOffsets[category][label] ?? { x: 0, y: 0 };
}

function createVisualNodes(seedNodes: BrainNodeData[]) {
  return seedNodes.map((node) => {
    if (node.kind === "core") {
      return {
        ...node,
        x: categoryLayout.core.left,
        y: categoryLayout.core.top,
        size: centerNodeSize,
        background: "linear-gradient(145deg, #f5f0e8 0%, #ede8de 100%)",
        borderColor: "rgba(0,180,160,0.3)",
        textColor: "#0a0a0a",
        accentColor: "#00b4a0"
      };
    }

    if (node.kind === "category") {
      const visual = categoryVisuals[node.id as BrainCategoryId];
      const layout = categoryLayout[node.id as BrainCategoryId];

      return {
        ...node,
        x: layout.left,
        y: layout.top,
        size: categoryNodeSize,
        background: "#ffffff",
        borderColor: "rgba(0,0,0,0.08)",
        textColor: "#999999",
        accentColor: visual.accent
      };
    }

    const visual = categoryVisuals[node.category as BrainCategoryId];
    const offset = getInitialSubnodeOffset(node.category as BrainCategoryId, node.label);

    return {
      ...node,
      x: offset.x,
      y: offset.y,
      size: 30,
      background: visual.tint,
      borderColor: visual.border,
      textColor: visual.text,
      accentColor: visual.accent
    };
  });
}

function getAnchorPosition(category: BrainCategoryId | "core", canvasSize: CanvasSize): NodePosition {
  const layout = category === "core" ? categoryLayout.core : categoryLayout[category];

  return {
    x: (layout.left / 100) * canvasSize.width,
    y: (layout.top / 100) * canvasSize.height
  };
}

function createPositionMap(seedNodes: BrainNodeData[], canvasSize: CanvasSize): NodePositions {
  const positions: NodePositions = {};

  const coreNode = seedNodes.find((node) => node.kind === "core");
  if (coreNode) {
    positions[coreNode.id] = getAnchorPosition("core", canvasSize);
  }

  seedNodes.forEach((node) => {
    if (node.kind !== "category") {
      return;
    }

    positions[node.id] = getAnchorPosition(node.id as BrainCategoryId, canvasSize);
  });

  seedNodes.forEach((node) => {
    if (node.kind !== "sub" || !node.category) {
      return;
    }

    const parentId = node.parentId ?? node.category;
    const parentPosition = positions[parentId] ?? getAnchorPosition(node.category, canvasSize);
    const offset = getInitialSubnodeOffset(node.category, node.label);

    positions[node.id] = {
      x: parentPosition.x + offset.x,
      y: parentPosition.y + offset.y
    };
  });

  return positions;
}

function getUploadVisual(category: BrainCategoryId) {
  const visual = categoryVisuals[category];

  return {
    background: visual.tint,
    borderColor: visual.border,
    accentColor: visual.accent,
    textColor: visual.text
  };
}

function getDetailStatus(item: BrainDetailItem, index: number): DetailStatus {
  if (item.id.startsWith("brain-detail")) {
    return { label: "pending", color: "#b8b8b2" };
  }

  const slot = index % 3;
  if (slot === 0) {
    return { label: "ready", color: "#00b46e" };
  }

  if (slot === 1) {
    return { label: "processing", color: "#f59340" };
  }

  return { label: "pending", color: "#b8b8b2" };
}

function isUploadableCategory(category: BrainCategoryId | null): category is Exclude<BrainCategoryId, "team"> {
  return category === "docs" || category === "comms" || category === "changes" || category === "decisions";
}

export function ProjectBrainPage() {
  const navigate = useNavigate();
  const { id = "1" } = useParams();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragDistanceRef = useRef<Record<string, number>>({});

  const project = mockProjects.find((item) => item.id === id) ?? mockProjects[0];
  const brainSeed = mockProjectBrains[id] ?? mockProjectBrains["1"];

  const [canvasSize, setCanvasSize] = useState<CanvasSize>(() => getInitialCanvasSize());
  const [nodes, setNodes] = useState<BrainNodeData[]>(() => createVisualNodes(brainSeed.nodes));
  const [positions, setPositions] = useState<NodePositions>(() => createPositionMap(createVisualNodes(brainSeed.nodes), getInitialCanvasSize()));
  const [zoom, setZoom] = useState(1);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<BrainCategoryId | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [travelDotsActive, setTravelDotsActive] = useState(false);
  const [freshNodeIds, setFreshNodeIds] = useState<string[]>([]);
  const [freshEdgeIds, setFreshEdgeIds] = useState<string[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedUploadType, setSelectedUploadType] = useState<UploadTypeId>("prd");
  const [uploadName, setUploadName] = useState("");

  useEffect(() => {
    const nextNodes = createVisualNodes(brainSeed.nodes);
    setNodes(nextNodes);
    setPositions(createPositionMap(nextNodes, canvasSize));
    setZoom(1);
    setHoveredNodeId(null);
    setActiveCategoryId(null);
    setSelectedDetailId(null);
    setFreshNodeIds([]);
    setFreshEdgeIds([]);
    setIsUploadModalOpen(false);
    setSelectedUploadType("prd");
    setUploadName("");
    setTravelDotsActive(false);
    setAnimationKey((current) => current + 1);
  }, [brainSeed, canvasSize.height, canvasSize.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1)
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    setTravelDotsActive(false);
    const timeoutId = window.setTimeout(() => {
      setTravelDotsActive(true);
    }, 1500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [animationKey]);

  const edges = useMemo(() => {
    const coreNode = nodes.find((node) => node.kind === "core");
    if (!coreNode) {
      return [];
    }

    const coreEdges = nodes
      .filter((node) => node.kind === "category")
      .map((node, index) => ({
        id: `${coreNode.id}-${node.id}`,
        from: coreNode.id,
        to: node.id,
        kind: "core" as const,
        order: index
      }));

    const branchEdges = nodes
      .filter((node) => node.kind === "sub")
      .map((node, index) => ({
        id: `${node.parentId}-${node.id}`,
        from: node.parentId ?? coreNode.id,
        to: node.id,
        kind: "branch" as const,
        order: index
      }));

    return [...coreEdges, ...branchEdges];
  }, [nodes]);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const categoryIndexMap = useMemo(
    () => new Map(nodes.filter((node) => node.kind === "category").map((node, index) => [node.id, index])),
    [nodes]
  );
  const subIndexMap = useMemo(
    () => new Map(nodes.filter((node) => node.kind === "sub").map((node, index) => [node.id, index])),
    [nodes]
  );

  const activeCategoryNode = nodes.find((node) => node.id === activeCategoryId && node.kind === "category") ?? null;
  const activeCategoryItems = activeCategoryNode?.detailItems ?? [];
  const activeCategoryVisual = activeCategoryId ? categoryVisuals[activeCategoryId] : null;

  const openUploadModal = (category?: BrainCategoryId | null) => {
    if (category && defaultUploadTypeByCategory[category]) {
      setSelectedUploadType(defaultUploadTypeByCategory[category] as UploadTypeId);
    } else {
      setSelectedUploadType("prd");
    }

    setUploadName("");
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setSelectedUploadType("prd");
    setUploadName("");
  };

  const handleNodeClick = (node: BrainNodeData) => {
    if (node.kind === "core") {
      const fallbackCategory = activeCategoryId ?? "docs";
      const fallbackNode = nodes.find((item) => item.id === fallbackCategory && item.kind === "category");

      setActiveCategoryId(fallbackCategory);
      setSelectedDetailId(fallbackNode?.detailItems?.[0]?.id ?? null);
      return;
    }

    const targetCategory = node.kind === "category" ? (node.id as BrainCategoryId) : (node.category as BrainCategoryId);
    const categoryNode = nodes.find((item) => item.id === targetCategory && item.kind === "category");
    const matchedDetail =
      node.kind === "sub"
        ? categoryNode?.detailItems?.find((item) => item.label === node.label)
        : categoryNode?.detailItems?.[0];

    setActiveCategoryId(targetCategory);
    setSelectedDetailId(matchedDetail?.id ?? null);
  };

  const handleDetailAction = (item: BrainDetailItem) => {
    setSelectedDetailId(item.id);

    if (item.action === "navigate-docs") {
      navigate(`/projects/${project.id}/docs`);
      return;
    }

    if (item.action === "navigate-requests") {
      navigate(`/projects/${project.id}/requests`);
    }
  };

  const handleUploadSubmit = () => {
    const trimmedName = uploadName.trim();
    if (!trimmedName) {
      return;
    }

    const targetCategory = uploadCategoryMap[selectedUploadType];
    const uploadOption = uploadTypeOptions.find((option) => option.id === selectedUploadType);
    const nodeId = Date.now().toString();
    const detailId = createLocalId("brain-detail");
    const edgeId = `${targetCategory}-${nodeId}`;
    const visual = getUploadVisual(targetCategory);
    const detailLabel = uploadOption?.label ?? "Document";
    const parentPosition = positions[targetCategory] ?? getAnchorPosition(targetCategory, canvasSize);
    const nextPosition = {
      x: parentPosition.x + (Math.random() - 0.5) * 120,
      y: parentPosition.y + (Math.random() - 0.5) * 80
    };

    setNodes((current) => {
      const nextDetailItems = [
        ...((current.find((node) => node.id === targetCategory && node.kind === "category")?.detailItems ?? []) as BrainDetailItem[]),
        {
          id: detailId,
          label: trimmedName,
          description: `${detailLabel} added to ${targetCategory.toUpperCase()} from the upload modal.`,
          action: "detail" as const
        }
      ];

      const nextNode: BrainNodeData = {
        id: nodeId,
        kind: "sub",
        label: trimmedName,
        x: nextPosition.x,
        y: nextPosition.y,
        size: 30,
        parentId: targetCategory,
        category: targetCategory,
        icon: undefined,
        background: visual.background,
        borderColor: visual.borderColor,
        textColor: visual.textColor,
        accentColor: visual.accentColor,
        shadow: "0 2px 8px rgba(0,0,0,0.06)",
        tooltip: trimmedName,
        countLabel: "Newly added"
      };

      return current
        .map((node) => {
          if (node.id !== targetCategory || node.kind !== "category") {
            return node;
          }

          return {
            ...node,
            detailItems: nextDetailItems,
            countLabel: getCategoryCountLabel(targetCategory, nextDetailItems.length)
          };
        })
        .concat(nextNode);
    });
    setPositions((current) => ({
      ...current,
      [nodeId]: nextPosition
    }));

    setFreshNodeIds((current) => [...current, nodeId]);
    setFreshEdgeIds((current) => [...current, edgeId]);
    setActiveCategoryId(targetCategory);
    setSelectedDetailId(detailId);
    closeUploadModal();

    window.setTimeout(() => {
      setFreshNodeIds((current) => current.filter((item) => item !== nodeId));
      setFreshEdgeIds((current) => current.filter((item) => item !== edgeId));
    }, 700);
  };

  const handleNodeDrag = (nodeId: string, deltaX: number, deltaY: number) => {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    dragDistanceRef.current[nodeId] = (dragDistanceRef.current[nodeId] ?? 0) + Math.abs(deltaX) + Math.abs(deltaY);

    setPositions((current) => {
      const previous = current[nodeId];
      if (!previous) {
        return current;
      }

      return {
        ...current,
        [nodeId]: {
          x: previous.x + deltaX / zoom,
          y: previous.y + deltaY / zoom
        }
      };
    });
  };

  const handleNodePress = (nodeId: string) => {
    dragDistanceRef.current[nodeId] = 0;
  };

  const handleNodeSelect = (node: BrainNodeData) => {
    if ((dragDistanceRef.current[node.id] ?? 0) > 4) {
      dragDistanceRef.current[node.id] = 0;
      return;
    }

    handleNodeClick(node);
  };

  const resetBrainView = () => {
    const nextNodes = createVisualNodes(brainSeed.nodes);
    setNodes(nextNodes);
    setPositions(createPositionMap(nextNodes, canvasSize));
    setZoom(1);
    setHoveredNodeId(null);
    setActiveCategoryId(null);
    setSelectedDetailId(null);
    setFreshNodeIds([]);
    setFreshEdgeIds([]);
    setTravelDotsActive(false);
    setAnimationKey((current) => current + 1);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => clamp(current + (event.deltaY < 0 ? 0.08 : -0.08), 0.72, 1.4));
  };

  return (
    <section className="relative h-full overflow-hidden bg-[#fafaf8]">
      <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center border-b border-[rgba(0,0,0,0.06)] bg-[rgba(250,250,248,0.9)] px-7 backdrop-blur-md">
        <div className="flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="font-syne text-[13px] text-[#888888] transition-colors hover:text-[#0a0a0a]"
          >
            ←
          </button>
          <span className="mx-4 h-4 w-px bg-[#e5e5e0]" />
          <p className="font-bebas text-[15px] text-[#0a0a0a]">{project.name.toUpperCase()}</p>
          <span className="mx-2 font-syne text-[13px] text-[#cccccc]">/</span>
          <p className="font-bebas text-[12px] tracking-[0.12em] text-[#00b4a0]">BRAIN</p>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex items-center gap-2 rounded-full border border-[rgba(0,180,160,0.2)] bg-[rgba(0,180,160,0.08)] px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-[#00b46e]" />
            <span className="font-syne text-[11px] font-semibold text-[#00b4a0]">BRAIN ACTIVE</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => openUploadModal()}
            className="rounded-xl border border-[#e5e5e0] px-[14px] py-[7px] font-syne text-[12px] text-[#555555] transition-colors hover:border-[#00b4a0] hover:text-[#00b4a0]"
          >
            UPLOAD
          </button>
          <button
            type="button"
            onClick={resetBrainView}
            className="rounded-xl bg-[#0a0a0a] px-[14px] py-[7px] font-bebas text-[12px] tracking-[0.08em] text-white transition-colors hover:bg-[#00b4a0]"
          >
            REBUILD
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        onWheel={handleWheel}
        className="absolute inset-x-0 bottom-0 top-14 overflow-hidden bg-[#fafaf8]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(0,180,160,0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px"
        }}
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,180,160,0.06)_0%,transparent_70%)]" />

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="absolute inset-0">
          <motion.div
            key={animationKey}
            animate={{ scale: zoom }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
            style={{ transformOrigin: "50% 50%" }}
          >
            <svg
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              className="absolute inset-0 z-[2] h-full w-full overflow-visible pointer-events-none"
            >
              {edges.map((edge) => {
                const fromNode = nodeMap.get(edge.from);
                const toNode = nodeMap.get(edge.to);
                const fromPosition = positions[edge.from];
                const toPosition = positions[edge.to];

                if (!fromNode || !toNode || !fromPosition || !toPosition) {
                  return null;
                }

                const highlighted = hoveredNodeId ? edge.from === hoveredNodeId || edge.to === hoveredNodeId : false;
                const stroke =
                  edge.kind === "core" ? hexToRgba("#00b4a0", highlighted ? 1 : 0.2) : highlighted ? hexToRgba("#0a0a0a", 1) : "rgba(0,0,0,0.06)";
                const strokeWidth = edge.kind === "core" ? 1.5 : 1;
                const isFreshEdge = freshEdgeIds.includes(edge.id);
                const shouldDraw = edge.kind === "core" || isFreshEdge;
                const drawDelay = edge.kind === "core" ? edge.order * 0.08 : 0;

                return (
                  <g key={`${animationKey}-${edge.id}`}>
                    <motion.line
                      x1={fromPosition.x}
                      y1={fromPosition.y}
                      x2={toPosition.x}
                      y2={toPosition.y}
                      vectorEffect="non-scaling-stroke"
                      initial={{
                        strokeDasharray: shouldDraw ? edgeDrawLength : undefined,
                        strokeDashoffset: shouldDraw ? edgeDrawLength : 0,
                        opacity: shouldDraw ? 0 : 1
                      }}
                      animate={{
                        strokeDashoffset: 0,
                        opacity: highlighted ? 1 : 1
                      }}
                      transition={{
                        strokeDashoffset: shouldDraw
                          ? {
                              duration: edge.kind === "core" ? 0.7 : 0.4,
                              delay: drawDelay,
                              ease: [0, 0, 0.2, 1]
                            }
                          : { duration: 0 },
                        opacity: {
                          duration: shouldDraw ? 0.22 : 0,
                          delay: drawDelay,
                          ease: [0.22, 1, 0.36, 1]
                        }
                      }}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                    />

                    {edge.kind === "core" && travelDotsActive ? (
                      <motion.circle
                        cx={fromPosition.x}
                        cy={fromPosition.y}
                        r="2"
                        fill="#00b4a0"
                        opacity={0.8}
                        animate={{
                          cx: [fromPosition.x, toPosition.x],
                          cy: [fromPosition.y, toPosition.y],
                          opacity: [0.8, 0]
                        }}
                        transition={{
                          duration: 2,
                          delay: edge.order * 0.4,
                          repeat: Infinity,
                          ease: "linear"
                        }}
                      />
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {nodes.map((node) => {
              const position = positions[node.id];
              const isCore = node.kind === "core";
              const isCategory = node.kind === "category";
              const isSub = node.kind === "sub";
              const categoryId = isCategory ? (node.id as BrainCategoryId) : node.category ?? null;
              const categoryVisual = categoryId ? categoryVisuals[categoryId] : null;
              const categoryDelay = isCategory ? (categoryIndexMap.get(node.id) ?? 0) * 0.1 : 0;
              const subIndex = isSub ? subIndexMap.get(node.id) ?? 0 : 0;
              const isFreshNode = freshNodeIds.includes(node.id);

              if (!position) {
                return null;
              }

              const initial =
                isCore
                  ? { scale: 0, opacity: 0 }
                  : isCategory
                    ? { scale: 0, opacity: 0 }
                    : { scale: isFreshNode ? 0 : 0.8, opacity: 0 };

              const animate =
                isCore
                  ? { scale: [0, 1.05, 1], opacity: [0, 1, 1] }
                  : { scale: 1, opacity: 1 };

              const transition =
                isCore
                  ? {
                      scale: { duration: 0.5, delay: 0.2, times: [0, 0.7, 1], ...nodeEnterTransition },
                      opacity: { duration: 0.3, delay: 0.2, ...nodeEnterTransition }
                    }
                  : isCategory
                    ? {
                        scale: { ...subNodeSpring, delay: 0.5 + categoryDelay },
                        opacity: { duration: 0.22, delay: 0.5 + categoryDelay, ...nodeEnterTransition }
                      }
                    : {
                        scale: { ...subNodeSpring, delay: isFreshNode ? 0 : 1 + subIndex * 0.04 },
                        opacity: { duration: 0.22, delay: isFreshNode ? 0 : 1 + subIndex * 0.04, ...nodeEnterTransition }
                      };

              return (
                <motion.button
                  key={`${animationKey}-${node.id}`}
                  type="button"
                  drag
                  dragMomentum={false}
                  dragElastic={0}
                  initial={initial}
                  animate={animate}
                  transition={transition}
                  whileHover={{
                    scale: isCategory ? 1.2 : isSub ? 1.06 : 1.04,
                    transition: hoverSpring
                  }}
                  transformTemplate={(_, generated) => `translate(-50%, -50%) ${generated}`}
                  className="absolute left-0 top-0 z-[10] cursor-grab border-0 bg-transparent p-0 active:cursor-grabbing"
                  style={{ x: position.x, y: position.y }}
                  onPointerDown={() => handleNodePress(node.id)}
                  onPointerEnter={() => setHoveredNodeId(node.id)}
                  onPointerLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                  onDrag={(_, info) => handleNodeDrag(node.id, info.delta.x, info.delta.y)}
                  onClick={() => handleNodeSelect(node)}
                >
                  {isCore ? (
                    <div className="relative flex items-center justify-center" style={{ width: centerNodeSize, height: centerNodeSize }}>
                      <motion.div
                        className="pointer-events-none absolute inset-[-14px] rounded-full border-[1.5px] border-[rgba(0,180,160,0.25)]"
                        animate={{ scale: [1, 1.2], opacity: [1, 0] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                      />
                      <motion.div
                        className="pointer-events-none absolute inset-[-28px] rounded-full border border-[rgba(0,180,160,0.12)]"
                        animate={{ scale: [1, 1.2], opacity: [0.5, 0] }}
                        transition={{ duration: 2.5, delay: 0.6, repeat: Infinity, ease: "easeOut" }}
                      />
                      <motion.div
                        className="pointer-events-none absolute inset-[-42px] rounded-full border border-[rgba(0,180,160,0.06)]"
                        animate={{ scale: [1, 1.25], opacity: [0.3, 0] }}
                        transition={{ duration: 2.5, delay: 1.2, repeat: Infinity, ease: "easeOut" }}
                      />

                      <div
                        className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-1 rounded-full"
                        style={{
                          background: "linear-gradient(145deg, #f5f0e8 0%, #ede8de 100%)",
                          border: "2px solid rgba(0,180,160,0.3)",
                          boxShadow: "0 0 0 10px rgba(0,180,160,0.06), 0 0 0 20px rgba(0,180,160,0.03), 0 16px 48px rgba(0,0,0,0.12)"
                        }}
                      >
                        <span className="mb-1 block h-[6px] w-[6px] rotate-45 bg-[#00b4a0]" />
                        <span className="font-bebas text-[15px] tracking-[0.16em] text-[#0a0a0a]">BRAIN</span>
                        <span className="mt-1 block h-[1.5px] w-5 rounded-full bg-[rgba(0,180,160,0.8)]" />
                      </div>
                    </div>
                  ) : null}

                  {isCategory && categoryId && categoryVisual ? (
                    <div className="relative">
                      <div
                        className="flex items-center justify-center rounded-full bg-white"
                        style={{
                          width: categoryNodeSize,
                          height: categoryNodeSize,
                          border: `1.5px solid ${hoveredNodeId === node.id ? categoryVisual.accent : "rgba(0,0,0,0.08)"}`,
                          boxShadow:
                            hoveredNodeId === node.id
                              ? `0 8px 40px ${hexToRgba(categoryVisual.accent, 0.2)}, 0 0 0 6px ${hexToRgba(categoryVisual.accent, 0.08)}`
                              : "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)"
                        }}
                      >
                        <span style={{ color: categoryVisual.accent }}>{getIcon(categoryVisual.icon, "h-[22px] w-[22px]")}</span>
                      </div>
                      <p className="absolute left-1/2 top-full mt-[10px] -translate-x-1/2 whitespace-nowrap text-center font-bebas text-[10px] tracking-[0.16em] text-[#999999]">
                        {node.label}
                      </p>
                    </div>
                  ) : null}

                  {isSub && categoryId && categoryVisual ? (
                    <div
                      className="flex h-[30px] min-w-[80px] items-center justify-center rounded-[10px] px-[14px]"
                      style={{
                        background: categoryVisual.tint,
                        border: `1.5px solid ${hoveredNodeId === node.id ? categoryVisual.accent : categoryVisual.border}`,
                        boxShadow:
                          hoveredNodeId === node.id
                            ? `0 6px 18px ${hexToRgba("#000000", 0.12)}`
                            : "0 2px 8px rgba(0,0,0,0.06)"
                      }}
                    >
                      <span className="font-syne text-[11px] font-semibold" style={{ color: categoryVisual.text }}>
                        {node.label}
                      </span>
                    </div>
                  ) : null}
                </motion.button>
              );
            })}
          </motion.div>

          <AnimatePresence>
            {activeCategoryNode && activeCategoryId && activeCategoryVisual ? (
              <motion.aside
                initial={{ x: 320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 320, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-0 right-0 top-0 z-20 w-[320px] overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.95)] px-6 py-7 shadow-[-8px_0_40px_rgba(0,0,0,0.08)] backdrop-blur-[20px]"
              >
                <div className="mb-6 flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ background: activeCategoryVisual.tint, color: activeCategoryVisual.accent }}
                  >
                    {getIcon(activeCategoryVisual.icon, "h-[18px] w-[18px]")}
                  </div>
                  <p className="font-bebas text-[18px] tracking-[0.06em] text-[#0a0a0a]">{activeCategoryNode.label}</p>
                  <button
                    type="button"
                    onClick={() => setActiveCategoryId(null)}
                    className="ml-auto font-syne text-[18px] text-[#888888] transition-colors hover:text-[#0a0a0a]"
                  >
                    ×
                  </button>
                </div>

                <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
                  {activeCategoryItems.map((item, index) => {
                    const status = getDetailStatus(item, index);
                    const selected = selectedDetailId === item.id;

                    return (
                      <motion.button
                        key={item.id}
                        variants={{
                          hidden: { opacity: 0, x: -8 },
                          visible: {
                            opacity: 1,
                            x: 0,
                            transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }
                          }
                        }}
                        type="button"
                        onClick={() => handleDetailAction(item)}
                        className="mb-3 w-full rounded-2xl border bg-[#fafaf8] p-4 text-left transition-colors"
                        style={{
                          borderColor: selected ? activeCategoryVisual.accent : "#eeeeea"
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <p className="font-syne text-[14px] font-semibold text-[#0a0a0a]">{item.label}</p>
                          <span className="ml-auto h-2 w-2 rounded-full" style={{ background: status.color }} />
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className="rounded-md px-2 py-[3px] font-bebas text-[10px] tracking-[0.12em]"
                            style={{ background: activeCategoryVisual.tint, color: activeCategoryVisual.accent }}
                          >
                            {activeCategoryVisual.typeLabel}
                          </span>
                          <span className="ml-auto font-syne text-[11px] text-[#888888]">View →</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>

                <button
                  type="button"
                  disabled={!isUploadableCategory(activeCategoryId)}
                  onClick={() => openUploadModal(activeCategoryId)}
                  className="mt-4 w-full rounded-xl border-[1.5px] border-dashed py-3 text-center font-syne text-[13px] transition-colors"
                  style={{
                    borderColor: isUploadableCategory(activeCategoryId) ? "#d0d0cc" : "#e5e5e0",
                    color: isUploadableCategory(activeCategoryId) ? "#888888" : "#c4c4bf",
                    background: isUploadableCategory(activeCategoryId) ? "transparent" : "#fcfcfa"
                  }}
                >
                  {isUploadableCategory(activeCategoryId) ? `ADD TO ${activeCategoryNode.label}` : "TEAM IS SYNCED"}
                </button>
              </motion.aside>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {isUploadModalOpen ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeUploadModal}
                className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  onClick={(event) => event.stopPropagation()}
                  className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
                >
                  <p className="font-bebas text-[20px] tracking-[0.06em] text-[#0a0a0a]">ADD TO BRAIN</p>
                  <p className="mt-2 font-syne text-[13px] text-[#888888]">What type of document is this?</p>

                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    {uploadTypeOptions.map((option) => {
                      const selected = selectedUploadType === option.id;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSelectedUploadType(option.id)}
                          className={[
                            "flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-left transition-colors",
                            selected
                              ? "border-[#00b4a0] bg-[rgba(0,180,160,0.06)]"
                              : "border-[#e5e5e0] hover:border-[#00b4a0]"
                          ].join(" ")}
                        >
                          <span className="text-[18px] leading-none">{option.emoji}</span>
                          <span className="font-syne text-[13px] text-[#333333]">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4">
                    <label className="mb-1.5 block font-bebas text-[10px] tracking-[0.16em] text-[#999999]">DOCUMENT NAME</label>
                    <input
                      value={uploadName}
                      onChange={(event) => setUploadName(event.target.value)}
                      className="w-full rounded-xl border border-[#e5e5e0] px-3.5 py-2.5 font-syne text-[13px] text-[#333333] outline-none transition-colors focus:border-[#00b4a0]"
                    />
                  </div>

                  <div className="mt-5 flex justify-end gap-2.5">
                    <button type="button" onClick={closeUploadModal} className="px-4 py-2 font-syne text-[13px] text-[#888888]">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleUploadSubmit}
                      disabled={!uploadName.trim()}
                      className="rounded-xl bg-[#0a0a0a] px-5 py-2.5 font-bebas text-[13px] tracking-[0.06em] text-white transition-colors hover:bg-[#00b4a0] disabled:cursor-not-allowed disabled:bg-[#cfcfcb]"
                    >
                      ADD TO BRAIN
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
