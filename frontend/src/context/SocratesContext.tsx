import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useParams } from "react-router-dom";

export type PageContext =
  | "dashboard"
  | "brain"
  | "flowchart"
  | "memory"
  | "live-doc"
  | "requests"
  | "project-overview";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  type: "text" | "diagram" | "citation";
  diagram?: {
    kind: "dependency" | "flowchart" | "sequence" | "usecase";
    mermaid: string;
    stats?: { label: string; value: string | number; color: string }[];
  };
  citations?: {
    source: string;
    excerpt: string;
    anchor: string;
  }[];
  timestamp: Date;
};

type DiagramKind = NonNullable<Message["diagram"]>["kind"];

type SocratesContextType = {
  messages: Message[];
  isStreaming: boolean;
  pageContext: PageContext;
  projectId: string | null;
  suggestions: string[];
  sendMessage: (content: string) => Promise<void>;
  setPageContext: (ctx: PageContext) => void;
};

const PAGE_SUGGESTIONS: Record<PageContext, string[]> = {
  dashboard: ["What's due this week?", "Any pending requests?", "Today's meetings?"],
  brain: ["Explain the core product flows", "Which areas are still unresolved?", "What changed most recently?"],
  flowchart: ["What are the critical paths?", "Which nodes have the most risk?", "Generate a dependency map"],
  memory: ["Find all decisions about auth", "What did the client say about payments?", "Show changes from last week"],
  "live-doc": ["Summarize this document", "What changed since v1?", "Generate a system diagram"],
  requests: ["Which requests are blocking?", "Summarize pending changes", "What needs approval today?"],
  "project-overview": ["How is BloomFast tracking?", "Who is overloaded?", "What's the next critical deadline?"]
};

const PROJECT_NAMES: Record<string, string> = {
  "1": "BloomFast",
  "2": "Elara Games",
  "3": "API Gateway"
};

let persistedMessages: Message[] = [];
let persistedPageContext: PageContext = "dashboard";
let persistedProjectId: string | null = null;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `msg_${Math.random().toString(36).slice(2, 10)}`;
}

function includesAny(content: string, terms: string[]) {
  return terms.some((term) => content.includes(term));
}

function resolvePageContext(pathname: string): PageContext {
  if (pathname === "/dashboard") {
    return "dashboard";
  }

  if (pathname.includes("/brain")) {
    return "brain";
  }

  if (pathname.includes("/flow")) {
    return "flowchart";
  }

  if (pathname.includes("/memory") || pathname.includes("/docs/")) {
    return "memory";
  }

  if (pathname.includes("/live-doc")) {
    return "live-doc";
  }

  if (pathname.includes("/requests")) {
    return "requests";
  }

  return "project-overview";
}

function getProjectName(projectId: string | null) {
  if (!projectId) {
    return "Portfolio";
  }

  return PROJECT_NAMES[projectId] ?? "BloomFast";
}

function buildDependencyDiagram(projectName: string) {
  return `graph LR
  Brief([${projectName} Brief]) --> DAG([Brain DAG])
  DAG --> Build([Build Scope])
  Messages([Client Messages]) -.-> Changes([Accepted Changes])
  Changes -.-> Decisions([Decisions])
  DAG --> Changes
  
  style Brief fill:#e8faf6,stroke:#00b4a0,color:#0a0a0a
  style DAG fill:#e8faf6,stroke:#00b4a0,color:#0a0a0a
  style Build fill:#eef4ff,stroke:#3b82f6,color:#0a0a0a
  style Messages fill:#f4f2fc,stroke:#8b7fd4,color:#0a0a0a
  style Changes fill:#fef3e8,stroke:#f59340,color:#0a0a0a
  style Decisions fill:#eef4ff,stroke:#3b82f6,color:#0a0a0a`;
}

function buildFlowchartDiagram(projectName: string) {
  return `flowchart TD
  A([${projectName} Order Placed]) --> B{Payment OK?}
  B -->|Yes| C[Create Order]
  B -->|No| D[/Notify Buyer/]
  C --> E{Driver Available?}
  E -->|Yes| F[Assign Driver]
  E -->|No| G[Queue Order]
  F --> H{Manager Approval?}
  H -->|Yes| I[Dispatch]
  H -->|No| G
  I --> J([Delivered])
  
  style A fill:#c8f0e8,stroke:#00b4a0,color:#0a0a0a
  style J fill:#c8f0e8,stroke:#00b4a0,color:#0a0a0a
  style B fill:#fceee4,stroke:#f59340,color:#0a0a0a
  style E fill:#fceee4,stroke:#f59340,color:#0a0a0a
  style H fill:#fceee4,stroke:#f59340,color:#0a0a0a`;
}

function buildSequenceDiagram(projectName: string) {
  return `sequenceDiagram
  autonumber
  actor Buyer
  participant API as API Gateway
  participant Orders as Order Service
  participant Driver as Driver Assignment
  participant Ops as Admin Panel
  
  Buyer->>API: Create ${projectName} order
  API->>Orders: Validate payload
  Orders->>Driver: Request availability
  Driver-->>Orders: Driver candidate found
  Orders->>Ops: Request manager approval
  Ops-->>Orders: Approved
  Orders-->>Buyer: Dispatch confirmed`;
}

function buildUseCaseDiagram(projectName: string) {
  return `graph LR
  Buyer([Buyer])
  Manager([Manager])
  Driver([Driver])
  
  subgraph ${projectName}
    Search[Browse & Search]
    Checkout[Checkout]
    Assign[Assign Driver]
    Approve[Approve Dispatch]
    Track[Track Delivery]
  end
  
  Buyer --> Search
  Buyer --> Checkout
  Buyer --> Track
  Manager --> Approve
  Driver --> Assign
  
  style Checkout fill:#c8f0e8,stroke:#00b4a0,color:#0a0a0a
  style Approve fill:#fceee4,stroke:#f59340,color:#0a0a0a
  style Assign fill:#eef4ff,stroke:#3b82f6,color:#0a0a0a`;
}

function pickTextResponse(pageContext: PageContext, content: string, projectName: string) {
  const responses: Record<PageContext, string[]> = {
    dashboard: [
      `You have **3 deadlines this week**: Payment Integration (3 days), Auth Module Handoff (5 days), and Dashboard v2 Delivery (11 days). ${projectName === "Portfolio" ? "BloomFast" : projectName} has the most urgent items.`,
      `**2 pending requests** need your attention: Jack from BloomFast wants a promo code system, and Elena from Elara Games is requesting dark mode support.`,
      `You have **3 meetings today**: BloomFast Standup at 9:00 AM, API Gateway Review at 11:30 AM, and Client Sync — Elara at 2:00 PM.`
    ],
    brain: [
      `${projectName} has **8 documents** indexed. The core flows are: Buyer Ordering → Florist Dashboard → Driver Assignment. Two nodes are still unresolved: Subscription Model and Third-party Driver API.`,
      `**Recent changes**: Manager approval requirement was added to Driver Assignment, OAuth was removed from auth scope, and Pro subscription was deferred to v2.`,
      `**Unresolved areas**: The Third-party Driver API provider has not been confirmed. The Subscription Model pricing is still under discussion between the client and your team.`
    ],
    flowchart: [
      `The critical path runs through **Buyer Ordering Flow → Driver Assignment → Admin Panel**. Driver Assignment is the highest-risk node because it depends on the unconfirmed Third-party Driver API.`,
      `**3 nodes are at risk**: Driver Assignment, Subscription Model, and Third-party Driver API.`,
      `The most connected node is **Order Service**. It depends on Payment, Driver Assignment, Florist Dashboard, and Notifications.`
    ],
    memory: [
      `Found **4 documents** mentioning authentication. The key decision was OAuth removal. Current truth: email/password only for v1.`,
      `The client mentioned payments in **3 messages**. Stripe is confirmed, payouts must never block dispatch, and the revenue share is 70/30.`,
      `**Last week's changes**: OAuth removed, manager approval added to driver flow, and Pro subscription deferred. All 3 are accepted and reflected in the Live Doc.`
    ],
    "live-doc": [
      `This document has **6 sections** with accepted changes marked. The most recently changed section is Authentication.`,
      `**Since v1**: Manager approval was added to Driver Assignment, OAuth was removed from auth, and Pro subscription moved to v2.`,
      `The system diagram shows **8 components** with 7 connections. The highest-risk connection is Driver Assignment → Third-party Driver API.`
    ],
    requests: [
      `**2 requests are pending**: Promo code system for BloomFast and Dark mode support for Elara Games. Both need review before they can become accepted changes.`,
      `The promo code request would affect **3 brain nodes**: Payment Integration, Buyer Ordering Flow, and Admin Panel.`,
      `**4 requests total**: 2 accepted and 2 pending. Accepted requests are already reflected in the Live Doc.`
    ],
    "project-overview": [
      `${projectName} is **34% complete** with a Jun 2026 deadline. Current status is HEALTHY. Sprint 2 of 8 is active and spend is tracking inside budget.`,
      `**Team load**: SC is managing overall, MT and PK are on payment integration, and JW is on the florist dashboard. No one is currently flagged as overloaded.`,
      `**Next critical deadline**: Payment Integration is due Apr 24. Marcus T and Priya K are assigned. Manager approval requirements were added last week.`
    ]
  };

  const options = responses[pageContext];

  if (pageContext === "dashboard") {
    if (includesAny(content, ["due", "deadline", "week"])) {
      return options[0];
    }

    if (includesAny(content, ["request", "pending", "approval"])) {
      return options[1];
    }

    if (includesAny(content, ["meeting", "today", "calendar"])) {
      return options[2];
    }
  }

  if (pageContext === "brain") {
    if (includesAny(content, ["flow", "core", "explain"])) {
      return options[0];
    }

    if (includesAny(content, ["change", "recent"])) {
      return options[1];
    }

    if (includesAny(content, ["unresolved", "risk"])) {
      return options[2];
    }
  }

  if (pageContext === "flowchart") {
    if (includesAny(content, ["critical", "path"])) {
      return options[0];
    }

    if (includesAny(content, ["risk", "risky"])) {
      return options[1];
    }

    if (includesAny(content, ["connected", "dependency"])) {
      return options[2];
    }
  }

  if (pageContext === "memory") {
    if (includesAny(content, ["auth", "authentication"])) {
      return options[0];
    }

    if (includesAny(content, ["payment", "payments"])) {
      return options[1];
    }

    if (includesAny(content, ["last week", "changes"])) {
      return options[2];
    }
  }

  if (pageContext === "live-doc") {
    if (includesAny(content, ["summarize", "summary", "document"])) {
      return options[0];
    }

    if (includesAny(content, ["v1", "changed", "since"])) {
      return options[1];
    }

    if (includesAny(content, ["diagram", "system"])) {
      return options[2];
    }
  }

  if (pageContext === "requests") {
    if (includesAny(content, ["block", "blocking"])) {
      return options[0];
    }

    if (includesAny(content, ["summarize", "summary", "pending"])) {
      return options[1];
    }

    if (includesAny(content, ["approval", "today"])) {
      return options[2];
    }
  }

  if (pageContext === "project-overview") {
    if (includesAny(content, ["tracking", "status", projectName.toLowerCase()])) {
      return options[0];
    }

    if (includesAny(content, ["overloaded", "load", "team"])) {
      return options[1];
    }

    if (includesAny(content, ["deadline", "critical", "next"])) {
      return options[2];
    }
  }

  return options[0];
}

export const SocratesContext = createContext<SocratesContextType | null>(null);

export function SocratesProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [messages, setMessages] = useState<Message[]>(persistedMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pageContext, setPageContextState] = useState<PageContext>(persistedPageContext);
  const [projectId, setProjectId] = useState<string | null>(persistedProjectId);

  const derivedPageContext = useMemo(() => resolvePageContext(location.pathname), [location.pathname]);

  useEffect(() => {
    setPageContextState(derivedPageContext);
  }, [derivedPageContext]);

  useEffect(() => {
    setProjectId(id ?? null);
  }, [id]);

  useEffect(() => {
    persistedMessages = messages;
  }, [messages]);

  useEffect(() => {
    persistedPageContext = pageContext;
  }, [pageContext]);

  useEffect(() => {
    persistedProjectId = projectId;
  }, [projectId]);

  const suggestions = PAGE_SUGGESTIONS[pageContext];

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();

      if (!trimmed || isStreaming) {
        return;
      }

      const userMessage: Message = {
        id: createId(),
        role: "user",
        content: trimmed,
        type: "text",
        timestamp: new Date()
      };

      setMessages((currentMessages) => [...currentMessages, userMessage]);
      setIsStreaming(true);

      const lowerContent = trimmed.toLowerCase();
      const projectName = getProjectName(projectId);
      const isDiagramRequest = includesAny(lowerContent, ["diagram", "flowchart", "dependency", "map", "sequence", "use case", "usecase"]);
      const isDependencyMap = includesAny(lowerContent, ["dependency", "map"]);
      const isSequenceDiagram = lowerContent.includes("sequence");
      const isUseCaseDiagram = includesAny(lowerContent, ["use case", "usecase"]);

      await delay(800);

      let response: Message;

      if (isDiagramRequest) {
        let kind: DiagramKind = "flowchart";
        let mermaid = buildFlowchartDiagram(projectName);
        let contentPrefix = `Generated from the current ${pageContext.replace("-", " ")} context for ${projectName}.`;

        if (isDependencyMap) {
          kind = "dependency";
          mermaid = buildDependencyDiagram(projectName);
          contentPrefix = `Here's the live dependency map for ${projectName}. I found 2 unresolved nodes and 3 critical paths.`;
        } else if (isSequenceDiagram) {
          kind = "sequence";
          mermaid = buildSequenceDiagram(projectName);
          contentPrefix = `Generated the latest interaction sequence for ${projectName} based on the current project state.`;
        } else if (isUseCaseDiagram) {
          kind = "usecase";
          mermaid = buildUseCaseDiagram(projectName);
          contentPrefix = `Generated a use case view for ${projectName} from the current project context.`;
        }

        response = {
          id: createId(),
          role: "assistant",
          content: contentPrefix,
          type: "diagram",
          diagram: {
            kind,
            mermaid,
            stats:
              kind === "dependency"
                ? [
                    { label: "CRITICAL", value: 4, color: "#e05555" },
                    { label: "RISKY", value: 3, color: "#f59340" },
                    { label: "CHANGES", value: 2, color: "#8b7fd4" }
                  ]
                : undefined
          },
          timestamp: new Date()
        };
      } else {
        const citations = includesAny(lowerContent, ["where", "source"])
          ? [
              {
                source: `${projectName} PRD v2 — Section 3`,
                excerpt: "Manager approval required before driver assignment confirmed.",
                anchor: "driver-body"
              }
            ]
          : undefined;

        response = {
          id: createId(),
          role: "assistant",
          content: pickTextResponse(pageContext, lowerContent, projectName),
          type: citations ? "citation" : "text",
          citations,
          timestamp: new Date()
        };
      }

      setMessages((currentMessages) => [...currentMessages, { ...response, content: "" }]);

      const words = response.content.split(" ");
      for (let index = 0; index < words.length; index += 1) {
        await delay(30);
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === response.id ? { ...message, content: words.slice(0, index + 1).join(" ") } : message
          )
        );
      }

      if (response.diagram || response.citations) {
        setMessages((currentMessages) => currentMessages.map((message) => (message.id === response.id ? response : message)));
      }

      setIsStreaming(false);
    },
    [isStreaming, pageContext, projectId]
  );

  return (
    <SocratesContext.Provider
      value={{
        messages,
        isStreaming,
        pageContext,
        projectId,
        suggestions,
        sendMessage,
        setPageContext: setPageContextState
      }}
    >
      {children}
    </SocratesContext.Provider>
  );
}

export function useSocrates() {
  const context = useContext(SocratesContext);

  if (!context) {
    throw new Error("useSocrates must be used within SocratesProvider");
  }

  return context;
}
