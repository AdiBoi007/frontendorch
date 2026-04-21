import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { mockSocratesMessages, mockSocratesReplies, mockSocratesSuggestions } from "../../lib/mockData";
import type { ChatMessage } from "../../lib/types";
import OmniLogo from "../ui/OmniLogo";

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none">
      <path
        d="M5 12h14M13 4l8 8-8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SocratesPanel() {
  const { pathname } = useLocation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...mockSocratesMessages]);

  const pageKey = useMemo<"dashboard" | "project">(() => {
    if (pathname.startsWith("/projects/")) {
      return "project";
    }

    return "dashboard";
  }, [pathname]);

  const suggestions = mockSocratesSuggestions[pageKey];
  const replyTemplate = mockSocratesReplies[pageKey];

  useEffect(() => {
    setMessages([...mockSocratesMessages]);
  }, [pageKey]);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 104)}px`;
  }, [query]);

  const submitMessage = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    const createId = () => {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }

      return `msg_${Math.random().toString(36).slice(2, 10)}`;
    };

    setMessages((current) => [
      ...current,
      { id: createId(), role: "user", content: trimmed },
      { id: createId(), role: "assistant", content: replyTemplate }
    ]);
    setQuery("");
  };

  return (
    <aside className="flex h-screen w-[300px] flex-shrink-0 flex-col border-r border-[#eeeeea] bg-white shadow-[4px_0_24px_rgba(0,0,0,0.04)]">
      <header className="px-6 pb-6 pt-8 text-center">
        <div className="mt-8 flex justify-center">
          <OmniLogo size={56} />
        </div>
        <p className="mt-3 font-bebas text-[11px] tracking-[3px] text-[#999999]">SOCRATES</p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#00b4a0]" />
          <p className="font-syne text-[12px] font-semibold text-[#00b4a0]">ONLINE</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-bebas text-[32px] leading-none text-[#0a0a0a]">Ready.</p>
            <p className="mt-2 max-w-[220px] font-syne text-[13px] text-[#888888]">
              Ask me about your projects, deadlines, or requests.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={[
                    "max-w-[85%] px-[14px] py-[10px] font-syne text-[13px]",
                    message.role === "user"
                      ? "rounded-2xl rounded-br-sm bg-[#0a0a0a] text-white"
                      : "rounded-2xl rounded-bl-sm border border-[#eeeeea] bg-[#f7f6f3] text-[#0a0a0a]"
                  ].join(" ")}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[#eeeeea] px-5 py-4">
        <div className="relative rounded-[18px] border-[1.5px] border-[rgba(255,255,255,0.9)] bg-[rgba(255,255,255,0.8)] px-4 pb-3 pt-3 pr-[52px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] backdrop-blur-[16px]">
          <textarea
            ref={textareaRef}
            rows={2}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask Socrates..."
            className="max-h-[104px] min-h-[40px] w-full resize-none bg-transparent font-syne text-[13px] text-[#333333] outline-none"
          />

          <motion.button
            type="button"
            onClick={submitMessage}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="absolute bottom-[10px] right-[10px] flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-[#e5e5e0] bg-[rgba(255,255,255,0.9)] text-[#0a0a0a] shadow-[0_2px_8px_rgba(0,0,0,0.1)] backdrop-blur-[8px] transition-colors hover:border-teal hover:bg-teal hover:text-white"
          >
            <SendIcon />
          </motion.button>
        </div>

        <div className="mt-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuery(suggestion)}
              className="mb-[6px] block border-l-2 border-teal pl-2 text-left font-syne text-[12px] text-[#888888] transition-colors hover:text-[#0a0a0a]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
