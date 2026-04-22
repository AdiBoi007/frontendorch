import mermaid from "mermaid";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { TbFileText } from "react-icons/tb";
import { TbArrowUp } from "react-icons/tb";
import { useNavigate } from "react-router-dom";
import { SocratesProvider, useSocrates, type Message } from "../../context/SocratesContext";
import OmniLogo from "../ui/OmniLogo";

const rotatingSuggestionPools = {
  dashboard: [
    "What's due this week?",
    "Any pending requests?",
    "Today's meetings?",
    "Which project needs attention first?",
    "Show me the biggest risks",
    "What changed since yesterday?"
  ],
  brain: [
    "Explain the core product flows",
    "Which areas are still unresolved?",
    "What changed most recently?",
    "Show me the critical dependencies",
    "What is blocking delivery?",
    "Summarize the current system state"
  ],
  flowchart: [
    "What are the critical paths?",
    "Which nodes have the most risk?",
    "Generate a dependency map",
    "Show the highest impact edge",
    "What breaks if payments fail?",
    "Summarize the main bottleneck"
  ],
  memory: [
    "Find all decisions about auth",
    "What did the client say about payments?",
    "Show changes from last week",
    "Which sources mention approvals?",
    "Find contradictions in the docs",
    "What was decided most recently?"
  ],
  "live-doc": [
    "Summarize this document",
    "What changed since v1?",
    "Generate a system diagram",
    "Show unresolved sections",
    "Which changes came from the client?",
    "What needs another review?"
  ],
  requests: [
    "Which requests are blocking?",
    "Summarize pending changes",
    "What needs approval today?",
    "Which request affects scope most?",
    "Show accepted vs pending",
    "What should I review first?"
  ],
  "project-overview": [
    "How is BloomFast tracking?",
    "Who is overloaded?",
    "What's the next critical deadline?",
    "What should we ship next?",
    "Show current project risks",
    "Summarize team workload"
  ]
} as const;

function formatTimestamp(timestamp: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}

function renderFormattedText(content: string) {
  return content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-text1">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function MermaidDiagram({ chart, id, height }: { chart: string; id: string; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(`socrates-diagram-${id}-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    let cancelled = false;

    const renderDiagram = async () => {
      if (!ref.current) {
        return;
      }

      ref.current.innerHTML = "";

      try {
        const { svg, bindFunctions } = await mermaid.render(renderIdRef.current, chart);

        if (!ref.current || cancelled) {
          return;
        }

        ref.current.innerHTML = svg;
        bindFunctions?.(ref.current);
      } catch (error) {
        if (ref.current && !cancelled) {
          ref.current.innerHTML =
            '<div class="flex h-full items-center justify-center font-mono text-[11px] text-[#888888]">Unable to render diagram.</div>';
        }

        console.error("Mermaid render failed", error);
      }
    };

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  return <div ref={ref} className="w-full overflow-x-auto [&_svg]:h-auto [&_svg]:w-full" style={{ minHeight: height }} />;
}

function StreamingDots() {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 3 }).map((_, index) => (
        <motion.span
          key={`dot-${index}`}
          animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.75, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 }}
          className="h-1 w-1 rounded-full bg-text1"
        />
      ))}
    </div>
  );
}

function AssistantDiagramCard({ message }: { message: Message }) {
  if (!message.diagram) {
    return null;
  }

  const isDependency = message.diagram.kind === "dependency";

  return (
    <div className="max-w-full">
      <p className="mb-2 font-sans text-meta leading-6 text-textBody">{renderFormattedText(message.content)}</p>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex items-center gap-2 border-b border-border px-[14px] py-[10px]">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-text2">
            {isDependency ? "LIVE DEPENDENCY MAP" : `${message.diagram.kind.toUpperCase()} DIAGRAM`}
          </p>

          {isDependency ? (
            <span className="ml-auto rounded-md border border-amber-200 bg-amber-50 px-2 py-[2px] font-sans text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-800">
              2 unresolved
            </span>
          ) : null}
        </div>

        <div className="p-3">
          <MermaidDiagram chart={message.diagram.mermaid} id={message.id} height={isDependency ? 160 : 200} />
        </div>

        {isDependency && message.diagram.stats ? (
          <div className="flex gap-4 border-t border-border bg-bg px-[14px] py-2">
            {message.diagram.stats.map((stat) => (
              <div key={stat.label}>
                <p className="font-sans text-[18px] font-semibold leading-none" style={{ color: stat.color }}>
                  {stat.value}
                </p>
                <p className="mt-1 font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-text2">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onOpenCitation }: { message: Message; onOpenCitation: (anchor: string) => void }) {
  if (message.type === "diagram") {
    return <AssistantDiagramCard message={message} />;
  }

  return (
    <div className="max-w-[100%]">
      <div className="rounded-lg rounded-bl-sm border border-border bg-zinc-50 px-[14px] py-3 font-sans text-[13px] leading-[1.6] text-textBody">
        {renderFormattedText(message.content)}
      </div>

      {message.citations?.map((citation) => (
        <div key={`${message.id}-${citation.anchor}`} className="mt-2 rounded-lg border border-border bg-white p-[10px]">
          <div className="flex items-center">
            <TbFileText size={12} color="#111827" strokeWidth={1.5} />
            <span className="ml-1.5 font-mono text-[10px] text-text2">{citation.source}</span>
          </div>

          <p className="mt-1 line-clamp-2 font-sans text-[11px] italic text-textBody">{citation.excerpt}</p>

          <button type="button" onClick={() => onOpenCitation(citation.anchor)} className="mt-1 font-sans text-[10px] font-medium text-text1">
            OPEN →
          </button>
        </div>
      ))}
    </div>
  );
}

function MessageRow({
  message,
  isStreamingPlaceholder,
  onOpenCitation
}: {
  message: Message;
  isStreamingPlaceholder: boolean;
  onOpenCitation: (anchor: string) => void;
}) {
  if (isStreamingPlaceholder) {
    return null;
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="rounded-lg rounded-br-sm border border-border bg-white px-[14px] py-[10px] font-sans text-[13px] text-textBody shadow-sm">
            {message.content}
          </div>
          <p className="mt-1 text-right font-mono text-[9px] text-text3">{formatTimestamp(message.timestamp)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <AssistantMessage message={message} onOpenCitation={onOpenCitation} />
    </div>
  );
}

function SuggestionChips({ onSelect }: { onSelect: (value: string) => void }) {
  const { pageContext, suggestions, isStreaming, messages } = useSocrates();
  const [visibleStart, setVisibleStart] = useState(0);

  const suggestionPool = useMemo(
    () => [...new Set([...suggestions, ...rotatingSuggestionPools[pageContext]])],
    [pageContext, suggestions]
  );

  useEffect(() => {
    setVisibleStart(0);
  }, [pageContext]);

  useEffect(() => {
    if (suggestionPool.length <= 3) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setVisibleStart((current) => (current + 1) % suggestionPool.length);
    }, 3200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [suggestionPool]);

  useEffect(() => {
    if (messages.length === 0 || suggestionPool.length <= 3) {
      return;
    }

    setVisibleStart((current) => (current + 1) % suggestionPool.length);
  }, [messages.length, suggestionPool]);

  const visibleSuggestions = useMemo(() => {
    if (suggestionPool.length === 0) {
      return [];
    }

    return [suggestionPool[visibleStart % suggestionPool.length]];
  }, [suggestionPool, visibleStart]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${pageContext}-${visibleStart}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="flex flex-wrap gap-2"
      >
        {visibleSuggestions.map((suggestion, index) => (
          <motion.button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            disabled={isStreaming}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            className="rounded-full border border-border bg-white px-3 py-2 font-sans text-[11px] text-textBody transition-colors hover:border-text1 hover:text-text1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </motion.button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

function SocratesPanelContent() {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const { messages, isStreaming, sendMessage, projectId, pageContext } = useSocrates();

  const lastMessage = messages[messages.length - 1];
  const showStreamingIndicator = isStreaming && lastMessage?.role === "assistant";

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 104)}px`;
  }, [query]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  const emptyStateLabel = useMemo(() => {
    if (pageContext === "dashboard") {
      return "Ask about deadlines, meetings, or requests.";
    }

    return "Ask about this project, its documents, or generate a diagram.";
  }, [pageContext]);

  const handleSubmit = async () => {
    const trimmed = query.trim();

    if (!trimmed || isStreaming) {
      return;
    }

    setQuery("");
    await sendMessage(trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    void sendMessage(suggestion);
    setQuery("");
  };

  const handleOpenCitation = (anchor: string) => {
    if (!projectId) {
      return;
    }

    void navigate(`/projects/${projectId}/live-doc#${anchor}`);
  };

  return (
    <aside className="flex h-screen w-[300px] flex-shrink-0 flex-col border-r border-border bg-white">
      <header className="px-6 pb-5 pt-8 text-center">
        <div className="mt-6 flex justify-center">
          <OmniLogo size={52} />
        </div>
        <p className="mt-3 font-sans text-label font-semibold uppercase text-text2">Socrates</p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-text1" />
          <p className="font-sans text-meta font-medium text-text2">Online</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <p className="font-sans text-[22px] font-semibold leading-none text-text1">Ready</p>
            <p className="mt-2 font-sans text-[13px] text-text2">{emptyStateLabel}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                onOpenCitation={handleOpenCitation}
                isStreamingPlaceholder={showStreamingIndicator && index === messages.length - 1 && message.role === "assistant" && message.content.length === 0}
              />
            ))}

            {showStreamingIndicator ? (
              <div className="flex justify-start">
                <div className="rounded-lg rounded-bl-sm border border-border bg-zinc-50 px-[14px] py-3">
                  <StreamingDots />
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border bg-bg px-4 py-4">
        <div className="mb-3">
          <SuggestionChips onSelect={handleSuggestionSelect} />
        </div>

        <div className="relative rounded-lg border border-border bg-white px-4 pb-3 pr-[52px] pt-3 shadow-sm">
          <textarea
            ref={textareaRef}
            rows={2}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Socrates..."
            className="max-h-[104px] min-h-[38px] w-full resize-none bg-transparent pr-10 font-sans text-[13px] text-textBody outline-none"
          />

          <motion.button
            type="button"
            onClick={() => void handleSubmit()}
            whileHover={{ scale: isStreaming ? 1 : 1.03 }}
            whileTap={{ scale: isStreaming ? 1 : 0.96 }}
            disabled={isStreaming}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-zinc-100 text-text1 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <TbArrowUp size={20} strokeWidth={1.6} />
          </motion.button>
        </div>
      </div>
    </aside>
  );
}

export function SocratesPanel() {
  return (
    <SocratesProvider>
      <SocratesPanelContent />
    </SocratesProvider>
  );
}
