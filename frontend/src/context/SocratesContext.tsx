import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  apiCreateSocratesSession,
  apiGetSocratesHistory,
  apiGetSocratesSuggestions,
  apiPatchSocratesContext,
  apiStreamSocratesMessage,
  type SocratesCitation,
  type SocratesMessage,
  type SocratesOpenTarget,
  type SocratesPageContext,
  type SocratesSelectedRefType,
  type SocratesViewerState,
} from "../lib/api/socrates";
import { resolveSocratesContextFromPath, type SocratesContextState } from "../lib/page-context";
import { useAppShell } from "./AppShellContext";

type SelectionState = {
  selectedRefType: SocratesSelectedRefType | null;
  selectedRefId: string | null;
  viewerState: SocratesViewerState | null;
};

interface SocratesContextValue {
  sessionId: string | null;
  projectId: string | null;
  pageContext: SocratesPageContext | null;
  messages: SocratesMessage[];
  suggestions: string[];
  isBootstrapping: boolean;
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  setSelection: (selection: Partial<SelectionState>) => void;
  clearSelection: () => void;
}

const SocratesContext = createContext<SocratesContextValue | null>(null);

function createUserMessage(id: string, content: string, createdAt: string): SocratesMessage {
  return {
    id,
    role: "user",
    content,
    responseStatus: null,
    createdAt,
  };
}

function createAssistantPlaceholder(id: string, createdAt: string): SocratesMessage {
  return {
    id,
    role: "assistant",
    content: "",
    responseStatus: "streaming",
    createdAt,
  };
}

function makeKey(projectId: string | null, pageContext: SocratesPageContext | null) {
  if (!projectId || !pageContext) {
    return null;
  }
  return `${projectId}:${pageContext}`;
}

function normalizeContextState(defaultContext: SocratesContextState, overrides: SelectionState): SocratesContextState {
  return {
    pageContext: defaultContext.pageContext,
    selectedRefType:
      overrides.selectedRefType !== undefined ? overrides.selectedRefType : defaultContext.selectedRefType,
    selectedRefId: overrides.selectedRefId !== undefined ? overrides.selectedRefId : defaultContext.selectedRefId,
    viewerState: overrides.viewerState !== undefined ? overrides.viewerState : defaultContext.viewerState,
  };
}

function hashContext(context: SocratesContextState) {
  return JSON.stringify(context);
}

export function SocratesProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { status, activeProjectId, hasInternalAppAccess } = useAppShell();
  const sessionCacheRef = useRef(new Map<string, string>());
  const contextCacheRef = useRef(new Map<string, string>());
  const messagesCacheRef = useRef(new Map<string, SocratesMessage[]>());
  const suggestionsCacheRef = useRef(new Map<string, string[]>());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SocratesMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selection, setSelectionState] = useState<SelectionState>({
    selectedRefType: null,
    selectedRefId: null,
    viewerState: null,
  });

  const defaultContext = useMemo(() => resolveSocratesContextFromPath(location.pathname), [location.pathname]);
  const projectId = activeProjectId;

  useEffect(() => {
    setSelectionState({
      selectedRefType: null,
      selectedRefId: null,
      viewerState: null,
    });
  }, [location.pathname]);

  const resolvedContext = useMemo(() => {
    if (!defaultContext || !projectId || !hasInternalAppAccess || status !== "ready") {
      return null;
    }
    return normalizeContextState(defaultContext, selection);
  }, [defaultContext, hasInternalAppAccess, projectId, selection, status]);

  const sessionKey = useMemo(
    () => makeKey(projectId, resolvedContext?.pageContext ?? null),
    [projectId, resolvedContext?.pageContext]
  );

  useEffect(() => {
    if (!resolvedContext || !sessionKey || !projectId) {
      setActiveSessionId(null);
      setMessages([]);
      setSuggestions([]);
      return;
    }

    let cancelled = false;

    const syncSession = async () => {
      setIsBootstrapping(true);
      try {
        const contextHash = hashContext(resolvedContext);
        let sessionId = sessionCacheRef.current.get(sessionKey) ?? null;

        if (!sessionId) {
          const created = await apiCreateSocratesSession(projectId, {
            pageContext: resolvedContext.pageContext,
            ...(resolvedContext.selectedRefType && resolvedContext.selectedRefId
              ? {
                  selectedRefType: resolvedContext.selectedRefType,
                  selectedRefId: resolvedContext.selectedRefId,
                }
              : {}),
            ...(resolvedContext.viewerState ? { viewerState: resolvedContext.viewerState } : {}),
          });
          sessionId = created.id;
          sessionCacheRef.current.set(sessionKey, sessionId);
          contextCacheRef.current.set(sessionKey, contextHash);
        } else if (contextCacheRef.current.get(sessionKey) !== contextHash) {
          await apiPatchSocratesContext(projectId, sessionId, {
            pageContext: resolvedContext.pageContext,
            selectedRefType: resolvedContext.selectedRefType,
            selectedRefId: resolvedContext.selectedRefId,
            viewerState: resolvedContext.viewerState,
          });
          contextCacheRef.current.set(sessionKey, contextHash);
        }

        const [nextMessages, nextSuggestions] = await Promise.all([
          messagesCacheRef.current.has(sessionKey)
            ? Promise.resolve(messagesCacheRef.current.get(sessionKey) ?? [])
            : apiGetSocratesHistory(projectId, sessionId),
          suggestionsCacheRef.current.has(sessionKey)
            ? Promise.resolve(suggestionsCacheRef.current.get(sessionKey) ?? [])
            : apiGetSocratesSuggestions(projectId, sessionId),
        ]);

        if (cancelled) {
          return;
        }

        messagesCacheRef.current.set(sessionKey, nextMessages);
        suggestionsCacheRef.current.set(sessionKey, nextSuggestions);
        setMessages(nextMessages);
        setSuggestions(nextSuggestions);
        setActiveSessionId(sessionId);
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void syncSession();

    return () => {
      cancelled = true;
    };
  }, [projectId, resolvedContext, sessionKey]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !projectId || !activeSessionId || !sessionKey) {
        return;
      }

      setIsStreaming(true);

      let pendingAssistantMessageId = "";

      try {
        await apiStreamSocratesMessage(projectId, activeSessionId, content.trim(), {
          onMessageCreated: ({ userMessageId, assistantMessageId }) => {
            pendingAssistantMessageId = assistantMessageId;
            const createdAt = new Date().toISOString();
            setMessages((current) => {
              const next = [
                ...current,
                createUserMessage(userMessageId, content.trim(), createdAt),
                createAssistantPlaceholder(assistantMessageId, createdAt),
              ];
              messagesCacheRef.current.set(sessionKey, next);
              return next;
            });
          },
          onDelta: ({ text }) => {
            setMessages((current) => {
              const next = current.map((message) =>
                message.id === pendingAssistantMessageId
                  ? { ...message, content: `${message.content}${text}` }
                  : message
              );
              messagesCacheRef.current.set(sessionKey, next);
              return next;
            });
          },
          onDone: ({ assistantMessageId, answer_md, citations, open_targets, suggested_prompts }) => {
            setMessages((current) => {
              const next = current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: answer_md,
                      responseStatus: "completed" as const,
                      citations: citations as SocratesCitation[],
                      openTargets: open_targets as SocratesOpenTarget[],
                    }
                  : message
              );
              messagesCacheRef.current.set(sessionKey, next);
              return next;
            });
            suggestionsCacheRef.current.set(sessionKey, suggested_prompts);
            setSuggestions(suggested_prompts);
          },
          onError: ({ message }) => {
            setMessages((current) => {
              const next = current.map((entry) =>
                entry.id === pendingAssistantMessageId
                  ? { ...entry, content: message, responseStatus: "failed" as const }
                  : entry
              );
              messagesCacheRef.current.set(sessionKey, next);
              return next;
            });
          },
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [activeSessionId, projectId, sessionKey]
  );

  const setSelection = useCallback((next: Partial<SelectionState>) => {
    setSelectionState((current) => ({ ...current, ...next }));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionState({
      selectedRefType: null,
      selectedRefId: null,
      viewerState: null,
    });
  }, []);

  const value = useMemo<SocratesContextValue>(
    () => ({
      sessionId: activeSessionId,
      projectId,
      pageContext: resolvedContext?.pageContext ?? null,
      messages,
      suggestions,
      isBootstrapping,
      isStreaming,
      sendMessage,
      setSelection,
      clearSelection,
    }),
    [activeSessionId, clearSelection, isBootstrapping, isStreaming, messages, projectId, resolvedContext?.pageContext, sendMessage, setSelection, suggestions]
  );

  return <SocratesContext.Provider value={value}>{children}</SocratesContext.Provider>;
}

export function useSocrates() {
  const context = useContext(SocratesContext);
  if (!context) {
    throw new Error("useSocrates must be used within SocratesProvider");
  }
  return context;
}
