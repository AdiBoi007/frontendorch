import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { TbArrowUp, TbFileText } from "react-icons/tb";
import { useNavigate } from "react-router-dom";
import { useSocrates } from "../../context/SocratesContext";
import type { SocratesMessage, SocratesOpenTarget } from "../../lib/api/socrates";
import OmniLogo from "../ui/OmniLogo";

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
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

function MessageRow({
  message,
  onOpenTarget
}: {
  message: SocratesMessage;
  onOpenTarget: (target: SocratesOpenTarget) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="rounded-lg rounded-br-sm border border-border bg-white px-[14px] py-[10px] font-sans text-[13px] text-textBody shadow-sm">
            {message.content}
          </div>
          <p className="mt-1 text-right font-mono text-[9px] text-text3">{formatTimestamp(message.createdAt)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[100%]">
        <div className="rounded-lg rounded-bl-sm border border-border bg-zinc-50 px-[14px] py-3 font-sans text-[13px] leading-[1.6] text-textBody">
          {renderFormattedText(message.content)}
        </div>

        {message.citations?.map((citation) => (
          <div key={`${message.id}-${citation.refId}`} className="mt-2 rounded-lg border border-border bg-white p-[10px]">
            <div className="flex items-center">
              <TbFileText size={12} color="#111827" strokeWidth={1.5} />
              <span className="ml-1.5 font-mono text-[10px] text-text2">{citation.label}</span>
            </div>
            <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.12em] text-text3">
              {(citation.type ?? citation.citationType ?? "citation").replace(/_/g, " ")}
            </p>
          </div>
        ))}

        {message.openTargets && message.openTargets.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.openTargets.slice(0, 3).map((target, index) => (
              <button
                key={`${message.id}-target-${index}`}
                type="button"
                onClick={() => onOpenTarget(target)}
                className="rounded-full border border-border bg-white px-3 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.1em] text-text1"
              >
                Open {target.targetType.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function emptyStateLabel(pageContext: string | null) {
  switch (pageContext) {
    case "dashboard_general":
      return "Ask about project pressure, freshness, or recent movement.";
    case "dashboard_project":
      return "Ask about this project's workload, changes, or document readiness.";
    case "brain_overview":
      return "Ask about current product truth and accepted changes.";
    case "brain_graph":
      return "Ask about dependencies, affected nodes, or open risks.";
    case "doc_viewer":
      return "Ask about source evidence, citations, and provenance.";
    case "live_doc":
      return "Ask about current truth, review drafts, or section history.";
    default:
      return "Ask Socrates about the current page.";
  }
}

export function SocratesPanel() {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const { messages, suggestions, isStreaming, isBootstrapping, sendMessage, projectId, pageContext } = useSocrates();

  const lastMessage = messages[messages.length - 1];
  const showStreamingIndicator = isStreaming && lastMessage?.role === "assistant" && lastMessage.responseStatus === "streaming";

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

  const handleOpenTarget = (target: SocratesOpenTarget) => {
    if (!projectId) {
      return;
    }

    const ref = target.targetRef ?? target.targetPayloadJson ?? {};

    switch (target.targetType) {
      case "live_doc_section":
        if (typeof ref.sectionKey === "string") {
          navigate(`/projects/${projectId}/live-doc?sectionKey=${encodeURIComponent(ref.sectionKey)}`);
        }
        break;
      case "document_section":
        if (typeof ref.documentId === "string") {
          const params = new URLSearchParams();
          if (typeof ref.anchorId === "string") {
            params.set("anchorId", ref.anchorId);
          }
          navigate(`/projects/${projectId}/docs/${ref.documentId}/view${params.toString() ? `?${params.toString()}` : ""}`);
        }
        break;
      case "brain_node":
        navigate(`/projects/${projectId}/flow`);
        break;
      case "change_proposal":
      case "message":
      case "thread":
        navigate(`/projects/${projectId}/requests`);
        break;
      case "dashboard_filter":
        if (typeof ref.value === "string") {
          navigate(`/projects/${ref.value}/dashboard`);
        }
        break;
      default:
        break;
    }
  };

  const visibleSuggestions = useMemo(() => suggestions.slice(0, 3), [suggestions]);

  return (
    <aside className="flex h-screen w-[320px] flex-shrink-0 flex-col border-r border-border bg-white">
      <header className="px-6 pb-5 pt-8 text-center">
        <div className="mt-6 flex justify-center">
          <OmniLogo size={52} />
        </div>
        <p className="mt-3 font-sans text-label font-semibold uppercase text-text2">Socrates</p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-text1" />
          <p className="font-sans text-meta font-medium text-text2">{isBootstrapping ? "Syncing context" : "Ready"}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <p className="font-sans text-[22px] font-semibold leading-none text-text1">Ready</p>
            <p className="mt-2 font-sans text-[13px] text-text2">{emptyStateLabel(pageContext)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} onOpenTarget={handleOpenTarget} />
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
        <AnimatePresence mode="wait">
          <motion.div
            key={pageContext ?? "none"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="mb-3 flex flex-wrap gap-2"
          >
            {visibleSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void sendMessage(suggestion)}
                disabled={isStreaming}
                className="rounded-full border border-border bg-white px-3 py-2 font-sans text-[11px] text-textBody transition-colors hover:border-text1 hover:text-text1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </motion.div>
        </AnimatePresence>

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
            disabled={isStreaming || isBootstrapping}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-zinc-100 text-text1 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <TbArrowUp size={20} strokeWidth={1.6} />
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
