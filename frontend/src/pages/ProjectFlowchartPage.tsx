import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CheckSquareIcon,
  FileTextIcon,
  GitBranchIcon,
  Grid2x2Icon,
  MessageSquareIcon,
  SparklesIcon
} from "../components/ui/AppIcons";
import { getFlowGraph, getProjects } from "../lib/api";
import type { FlowEdge, FlowGraph, FlowNode } from "../lib/types";

type Point = {
  x: number;
  y: number;
};

type NodePositions = Record<string, Point>;

type CanvasSize = {
  width: number;
  height: number;
};

const worldWidth = 1400;
const worldHeight = 900;
const nodeWidth = 200;
const edgeAnchorX = 100;
const edgeAnchorY = 40;
const detailPanelWidth = 360;
const miniMapWidth = 160;
const miniMapHeight = 100;

const typeStyles: Record<
  FlowNode["type"],
  {
    bg: string;
    border: string;
    accent: string;
    tagBg: string;
    tagText: string;
  }
> = {
  flow: {
    bg: "#e8faf6",
    border: "rgba(0,180,160,0.4)",
    accent: "#00b4a0",
    tagBg: "rgba(0,180,160,0.15)",
    tagText: "#00806f"
  },
  module: {
    bg: "#f0eeff",
    border: "rgba(139,127,212,0.4)",
    accent: "#8b7fd4",
    tagBg: "rgba(139,127,212,0.15)",
    tagText: "#6b5dc4"
  },
  integration: {
    bg: "#eef4ff",
    border: "rgba(59,130,246,0.4)",
    accent: "#3b82f6",
    tagBg: "rgba(59,130,246,0.15)",
    tagText: "#1d4ed8"
  },
  approval: {
    bg: "#f0eeff",
    border: "rgba(139,127,212,0.4)",
    accent: "#8b7fd4",
    tagBg: "rgba(139,127,212,0.15)",
    tagText: "#6b5dc4"
  },
  unresolved: {
    bg: "#fef3e8",
    border: "rgba(245,147,64,0.4)",
    accent: "#f59340",
    tagBg: "rgba(245,147,64,0.15)",
    tagText: "#c4650a"
  }
};

const statusStyles: Record<
  FlowNode["status"],
  {
    dot: string;
    pillBg: string;
    pillText: string;
  }
> = {
  critical: {
    dot: "#e05555",
    pillBg: "#ffe0e0",
    pillText: "#e05555"
  },
  "at-risk": {
    dot: "#f59340",
    pillBg: "#ffefd6",
    pillText: "#f59340"
  },
  stable: {
    dot: "#00b4a0",
    pillBg: "#e8faf6",
    pillText: "#00b4a0"
  },
  unresolved: {
    dot: "rgba(245,147,64,0.6)",
    pillBg: "#fff3e0",
    pillText: "#f59340"
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatNodeId(id: string) {
  const match = id.match(/^n(\d+)$/i);
  if (!match) {
    return id.toUpperCase();
  }

  return `N-${match[1].padStart(2, "0")}`;
}

function getTypeLabel(type: FlowNode["type"]) {
  return type.replace("-", " ").toUpperCase();
}

function getStatusLabel(status: FlowNode["status"]) {
  return status.toUpperCase();
}

function buildNodePositions(nodes: FlowNode[]): NodePositions {
  return Object.fromEntries(nodes.map((node) => [node.id, { ...node.position }]));
}

function getFitViewport(canvasSize: CanvasSize) {
  const padding = 80;
  const zoom = clamp(Math.min((canvasSize.width - padding) / worldWidth, (canvasSize.height - padding) / worldHeight), 0.5, 2);

  return {
    zoom,
    pan: {
      x: (canvasSize.width - worldWidth * zoom) / 2,
      y: (canvasSize.height - worldHeight * zoom) / 2
    }
  };
}

function getNodeIcon(type: FlowNode["type"], className = "h-4 w-4") {
  if (type === "flow") {
    return <SparklesIcon className={className} />;
  }

  if (type === "module") {
    return <Grid2x2Icon className={className} />;
  }

  if (type === "integration") {
    return <GitBranchIcon className={className} />;
  }

  if (type === "approval") {
    return <CheckSquareIcon className={className} />;
  }

  return <MessageSquareIcon className={className} />;
}

function getBezierMidpoint(
  startX: number,
  startY: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  endX: number,
  endY: number
) {
  const t = 0.5;
  const omt = 1 - t;

  return {
    x: omt ** 3 * startX + 3 * omt ** 2 * t * c1x + 3 * omt * t ** 2 * c2x + t ** 3 * endX,
    y: omt ** 3 * startY + 3 * omt ** 2 * t * c1y + 3 * omt * t ** 2 * c2y + t ** 3 * endY
  };
}

export function ProjectFlowchartPage() {
  const navigate = useNavigate();
  const { id = "1" } = useParams();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const initializedViewportRef = useRef(false);
  const panAnchorRef = useRef<Point>({ x: 0, y: 0 });
  const dragBaseRef = useRef<Record<string, Point>>({});
  const dragDistanceRef = useRef<Record<string, number>>({});

  const [projectName, setProjectName] = useState("PROJECT");
  const [graph, setGraph] = useState<FlowGraph | null>(null);
  const [nodePositions, setNodePositions] = useState<NodePositions>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [dragLocked, setDragLocked] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      const [projects, flowGraph] = await Promise.all([getProjects(), getFlowGraph(id)]);
      if (isCancelled) {
        return;
      }

      const project = projects.find((item) => item.id === id) ?? projects[0];
      setProjectName(project?.name ?? "PROJECT");
      setGraph(flowGraph);
      setNodePositions(buildNodePositions(flowGraph.nodes));
      setSelectedNodeId(null);
      initializedViewportRef.current = false;
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize({
        width: rect.width,
        height: rect.height
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!graph || canvasSize.width === 0 || canvasSize.height === 0 || initializedViewportRef.current) {
      return;
    }

    const viewport = getFitViewport(canvasSize);
    setPan(viewport.pan);
    setZoom(viewport.zoom);
    initializedViewportRef.current = true;
  }, [canvasSize, graph]);

  useEffect(() => {
    if (!isPanning) {
      return;
    }

    const handleMove = (event: globalThis.MouseEvent) => {
      const nextPoint = { x: event.clientX, y: event.clientY };
      const deltaX = nextPoint.x - panAnchorRef.current.x;
      const deltaY = nextPoint.y - panAnchorRef.current.y;

      panAnchorRef.current = nextPoint;
      setPan((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
    };

    const handleUp = () => {
      setIsPanning(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isPanning]);

  const selectedNode = useMemo(() => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null, [graph, selectedNodeId]);

  const nodeMap = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);

  const connections = useMemo(() => {
    if (!selectedNode || !graph) {
      return [];
    }

    return graph.edges
      .filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id)
      .map((edge) => {
        const otherNodeId = edge.from === selectedNode.id ? edge.to : edge.from;
        return {
          edge,
          node: nodeMap.get(otherNodeId) ?? null
        };
      })
      .filter((item): item is { edge: FlowEdge; node: FlowNode } => item.node !== null);
  }, [graph, nodeMap, selectedNode]);

  const visibleViewport = useMemo(() => {
    const visibleWidth = Math.max(canvasSize.width - (selectedNode ? detailPanelWidth : 0), 0);

    return {
      x: clamp(-pan.x / zoom, 0, worldWidth),
      y: clamp(-pan.y / zoom, 0, worldHeight),
      width: clamp(visibleWidth / zoom, 0, worldWidth),
      height: clamp(canvasSize.height / zoom, 0, worldHeight)
    };
  }, [canvasSize.height, canvasSize.width, pan.x, pan.y, selectedNode, zoom]);

  const handleCanvasMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    setIsPanning(true);
    panAnchorRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => clamp(current + (event.deltaY < 0 ? 0.1 : -0.1), 0.5, 2));
  };

  const handleDragStart = (nodeId: string) => {
    dragBaseRef.current[nodeId] = nodePositions[nodeId];
    dragDistanceRef.current[nodeId] = 0;
  };

  const handleDrag = (nodeId: string, info: PanInfo) => {
    const base = dragBaseRef.current[nodeId] ?? nodePositions[nodeId];
    dragDistanceRef.current[nodeId] = (dragDistanceRef.current[nodeId] ?? 0) + Math.abs(info.delta.x) + Math.abs(info.delta.y);

    setNodePositions((current) => ({
      ...current,
      [nodeId]: {
        x: base.x + info.offset.x / zoom,
        y: base.y + info.offset.y / zoom
      }
    }));
  };

  const handleDragEnd = (nodeId: string) => {
    delete dragBaseRef.current[nodeId];
  };

  const handleNodeClick = (nodeId: string) => {
    if ((dragDistanceRef.current[nodeId] ?? 0) > 4) {
      dragDistanceRef.current[nodeId] = 0;
      return;
    }

    setSelectedNodeId(nodeId);
  };

  const handleFitView = () => {
    const viewport = getFitViewport(canvasSize);
    setPan(viewport.pan);
    setZoom(viewport.zoom);
  };

  return (
    <section className="relative h-full overflow-hidden bg-[#f8f8f5]">
      <div className="absolute inset-x-0 top-0 z-20 flex h-[52px] items-center border-b border-[rgba(0,0,0,0.06)] bg-[rgba(248,248,245,0.9)] px-7 backdrop-blur-md">
        <div className="flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="font-syne text-[13px] text-[#888888] transition-colors hover:text-[#0a0a0a]"
          >
            ←
          </button>
          <span className="mx-4 h-4 w-px bg-[#e5e5e0]" />
          <p className="truncate font-bebas text-[15px] text-[#0a0a0a]">{projectName.toUpperCase()}</p>
          <span className="mx-2 font-syne text-[13px] text-[#cccccc]">/</span>
          <p className="font-bebas text-[12px] tracking-[0.12em] text-[#00b4a0]">FLOWCHART</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {([
            ["FLOW", "#00b4a0"],
            ["MODULE", "#8b7fd4"],
            ["INTEGRATION", "#3b82f6"],
            ["APPROVAL", "#8b7fd4"],
            ["UNRESOLVED", "#f59340"]
          ] as const).map(([label, color]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              <span className="font-bebas text-[10px] tracking-[0.1em] text-[#888888]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        className={["absolute inset-x-0 bottom-0 top-[52px] overflow-hidden", isPanning ? "cursor-grabbing" : "cursor-grab"].join(" ")}
      >
        {graph ? (
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{
              width: worldWidth,
              height: worldHeight,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0"
            }}
          >
            <svg width={worldWidth} height={worldHeight} className="absolute inset-0 z-[1] overflow-visible">
              {graph.edges.map((edge, index) => {
                const from = nodePositions[edge.from];
                const to = nodePositions[edge.to];
                if (!from || !to) {
                  return null;
                }

                const startX = from.x + edgeAnchorX;
                const startY = from.y + edgeAnchorY;
                const endX = to.x + edgeAnchorX;
                const endY = to.y + edgeAnchorY;
                const dx = to.x - from.x;
                const c1x = from.x + dx * 0.5 + edgeAnchorX;
                const c1y = from.y + edgeAnchorY;
                const c2x = to.x - dx * 0.5 + edgeAnchorX;
                const c2y = to.y + edgeAnchorY;
                const midpoint = getBezierMidpoint(startX, startY, c1x, c1y, c2x, c2y, endX, endY);
                const emphasized = hoveredNodeId ? edge.from === hoveredNodeId || edge.to === hoveredNodeId : false;

                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`}
                      fill="none"
                      stroke={edge.style === "solid" ? "#00b4a0" : "#f59340"}
                      strokeWidth={1.5}
                      strokeDasharray={edge.style === "dashed" ? "6 4" : undefined}
                      strokeLinecap="round"
                      opacity={emphasized ? 1 : edge.style === "solid" ? 0.35 : 0.5}
                    />

                    <motion.path
                      d={`M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`}
                      fill="none"
                      stroke={edge.style === "solid" ? "#00b4a0" : "#f59340"}
                      strokeWidth={1.5}
                      strokeDasharray={1000}
                      strokeLinecap="round"
                      initial={{ strokeDashoffset: 1000, opacity: 1 }}
                      animate={{ strokeDashoffset: 0, opacity: 0 }}
                      transition={{ duration: 0.8, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    />

                    {edge.label ? (
                      <text
                        x={midpoint.x}
                        y={midpoint.y - 8}
                        textAnchor="middle"
                        className="font-mono text-[10px] fill-[#999999]"
                        style={{ opacity: emphasized ? 1 : 0.92 }}
                      >
                        {edge.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {graph.nodes.map((node, index) => {
              const position = nodePositions[node.id];
              const typeStyle = typeStyles[node.type];
              const statusStyle = statusStyles[node.status];

              if (!position) {
                return null;
              }

              return (
                <motion.div
                  key={node.id}
                  drag={!dragLocked}
                  dragMomentum={false}
                  dragElastic={0}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    scale: { type: "spring", stiffness: 260, damping: 20, delay: index * 0.08 },
                    opacity: { duration: 0.22, delay: index * 0.08 }
                  }}
                  whileHover={{
                    scale: 1.02,
                    boxShadow: "0 8px 40px rgba(0,0,0,0.14)"
                  }}
                  className="pointer-events-auto absolute z-[2]"
                  style={{ left: position.x, top: position.y, width: nodeWidth }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dragDistanceRef.current[node.id] = 0;
                  }}
                  onDragStart={() => handleDragStart(node.id)}
                  onDrag={(_, info) => handleDrag(node.id, info)}
                  onDragEnd={() => handleDragEnd(node.id)}
                  onHoverStart={() => setHoveredNodeId(node.id)}
                  onHoverEnd={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                  onClick={() => handleNodeClick(node.id)}
                >
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: typeStyle.bg,
                      border: `1.5px solid ${hoveredNodeId === node.id ? typeStyle.accent : typeStyle.border}`,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                      cursor: dragLocked ? "pointer" : "grab"
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#888888]">{formatNodeId(node.id)}</span>
                      {node.status === "critical" ? (
                        <motion.span
                          className="ml-auto h-2 w-2 rounded-full bg-[#e05555]"
                          animate={{ scale: [1, 1.18, 1], opacity: [1, 0.7, 1] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        />
                      ) : (
                        <span className="ml-auto h-2 w-2 rounded-full" style={{ background: statusStyle.dot }} />
                      )}
                    </div>

                    <p className="mt-1.5 font-syne text-[15px] font-bold text-[#0a0a0a]">{node.label}</p>

                    <div className="mt-[10px] flex flex-wrap gap-1.5">
                      <span
                        className="rounded-md px-2 py-[3px] font-bebas text-[10px] tracking-[0.12em]"
                        style={{ background: typeStyle.tagBg, color: typeStyle.tagText }}
                      >
                        {getTypeLabel(node.type)}
                      </span>
                      {node.status === "critical" || node.status === "unresolved" ? (
                        <span
                          className="rounded-md px-2 py-[3px] font-bebas text-[10px] tracking-[0.12em]"
                          style={{
                            background: node.status === "critical" ? "rgba(224,85,85,0.12)" : "rgba(245,147,64,0.12)",
                            color: node.status === "critical" ? "#c02020" : "#c4650a"
                          }}
                        >
                          {getStatusLabel(node.status)}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 font-mono text-[9px] tracking-[0.16em] text-[#bbbbbb]">⊕ DRAG NODE</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : null}

        <div
          className="absolute bottom-6 left-6 z-10 overflow-hidden rounded-2xl border border-[#e5e5e0] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {[
            { key: "zoom-in", label: "+", onClick: () => setZoom((current) => clamp(current + 0.2, 0.5, 2)) },
            { key: "zoom-out", label: "-", onClick: () => setZoom((current) => clamp(current - 0.2, 0.5, 2)) },
            { key: "fit", label: "⊡", onClick: handleFitView },
            { key: "lock", label: dragLocked ? "🔒" : "🔓", onClick: () => setDragLocked((current) => !current) }
          ].map((control, index, array) => (
            <button
              key={control.key}
              type="button"
              onClick={control.onClick}
              className="flex h-10 w-10 items-center justify-center font-syne text-[18px] text-[#555555] transition-colors hover:bg-[#f5f5f2]"
              style={{ borderBottom: index === array.length - 1 ? "none" : "1px solid #f0f0ec" }}
            >
              {control.label}
            </button>
          ))}
        </div>

        <div
          className="absolute bottom-6 z-10 overflow-hidden rounded-2xl border border-[#e5e5e0] bg-[rgba(255,255,255,0.9)] shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
          style={{ width: miniMapWidth, height: miniMapHeight, right: selectedNode ? 384 : 24 }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="relative h-full w-full">
            {graph?.nodes.map((node) => {
              const position = nodePositions[node.id];
              if (!position) {
                return null;
              }

              return (
                <span
                  key={node.id}
                  className="absolute h-2 w-2 rounded-[2px]"
                  style={{
                    left: (position.x / worldWidth) * miniMapWidth,
                    top: (position.y / worldHeight) * miniMapHeight,
                    background: typeStyles[node.type].accent
                  }}
                />
              );
            })}

            <span
              className="absolute rounded-[6px] border border-[rgba(0,180,160,0.5)] bg-[rgba(0,180,160,0.08)]"
              style={{
                left: (visibleViewport.x / worldWidth) * miniMapWidth,
                top: (visibleViewport.y / worldHeight) * miniMapHeight,
                width: (visibleViewport.width / worldWidth) * miniMapWidth,
                height: (visibleViewport.height / worldHeight) * miniMapHeight
              }}
            />
          </div>
        </div>

        <AnimatePresence>
          {selectedNode ? (
            <motion.aside
              initial={{ x: detailPanelWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: detailPanelWidth, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 right-0 top-0 z-20 flex w-[360px] flex-col overflow-y-auto border-l border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.97)] shadow-[-8px_0_48px_rgba(0,0,0,0.1)] backdrop-blur-[20px]"
              onMouseDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="px-6 pt-6">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ background: typeStyles[selectedNode.type].bg, color: typeStyles[selectedNode.type].accent }}
                  >
                    {getNodeIcon(selectedNode.type)}
                  </div>
                  <span className="font-mono text-[11px] text-[#888888]">{formatNodeId(selectedNode.id)}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f5f2] font-syne text-[16px] text-[#888888] transition-colors hover:bg-[#e5e5e0]"
                  >
                    ×
                  </button>
                </div>

                <p className="mt-3 font-bebas text-[22px] tracking-[0.04em] text-[#0a0a0a]">{selectedNode.label}</p>

                <span
                  className="mt-2 inline-flex rounded-full px-3 py-1 font-bebas text-[11px] tracking-[0.12em]"
                  style={{
                    background: statusStyles[selectedNode.status].pillBg,
                    color: statusStyles[selectedNode.status].pillText
                  }}
                >
                  {getStatusLabel(selectedNode.status)}
                </span>

                <div className="mb-5 mt-5 h-px bg-[#f0f0ec]" />
              </div>

              <div className="px-6">
                <p className="mb-2 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">OVERVIEW</p>
                <p className="font-syne text-[14px] leading-7 text-[#333333]">{selectedNode.description}</p>
              </div>

              <div className="mt-6 px-6">
                <p className="mb-3 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">SOURCE EVIDENCE</p>
                {selectedNode.docRefs.map((docRef) => (
                  <button
                    key={docRef}
                    type="button"
                    className="mb-2 flex items-center gap-2.5 text-left transition-colors hover:text-[#0a0a0a]"
                  >
                    <span className="text-[#00b4a0]">
                      <FileTextIcon className="h-[14px] w-[14px]" />
                    </span>
                    <span className="font-syne text-[12px] text-[#555555]">{docRef}</span>
                  </button>
                ))}
              </div>

              <div className="mt-6 px-6">
                <p className="mb-3 font-bebas text-[10px] tracking-[0.16em] text-[#999999]">CONNECTED TO</p>
                {connections.map(({ edge, node }) => (
                  <div key={edge.id} className="mb-2 flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: typeStyles[node.type].accent }} />
                    <span className="font-syne text-[12px] text-[#555555]">{node.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-[#bbbbbb]">{edge.label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto p-6">
                <button
                  type="button"
                  className="w-full rounded-xl border-[1.5px] border-dashed border-[#d0d0cc] py-3 text-center font-syne text-[13px] text-[#888888] transition-colors hover:border-[#00b4a0] hover:bg-[rgba(0,180,160,0.04)] hover:text-[#00b4a0]"
                >
                  ASK SOCRATES ABOUT THIS
                </button>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
