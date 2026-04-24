import type {
  AnchorProvenance,
  BrainDetailItem,
  BrainNodeData,
  CalendarDayData,
  ChatMessage,
  DeadlineItem,
  Doc,
  DocViewerPayload,
  FlowGraph,
  LiveDocPayload,
  MeetingItem,
  ProjectBrainData,
  ProjectCardItem,
  ProjectDetail,
  RequestItem,
  RoleOption,
  SocratesReplyGroups,
  SocratesSuggestionGroups
} from "./types";

export const mockProjects: ProjectCardItem[] = [
  { id: "1", name: "BloomFast MVP", progress: 34, health: "HEALTHY", color: "#e5e7eb" },
  { id: "2", name: "Elara Games", progress: 38, health: "AT RISK", color: "#e0dbf5" },
  { id: "3", name: "API Gateway", progress: 79, health: "CRITICAL", color: "#fceee4" }
];

export const mockProjectDetail: ProjectDetail = {
  id: "1",
  name: "BloomFast MVP",
  health: "HEALTHY",
  progress: 34,
  description: "On-demand flower delivery marketplace. Buyer ordering, florist dashboard, driver assignment.",
  deadline: "Jun 2026",
  sprint: "2 of 8",
  budget: 85000,
  spent: 28900,
  team: [
    { initials: "SC", name: "Sarah Chen", role: "manager" },
    { initials: "MT", name: "Marcus T", role: "dev" },
    { initials: "PK", name: "Priya K", role: "dev" },
    { initials: "JW", name: "James W", role: "dev" },
    { initials: "AP", name: "Alex P", role: "dev" },
    { initials: "LF", name: "Lisa F", role: "client" }
  ],
  openRoles: 2,
  subscriptions: [
    { id: "s1", name: "AWS (EC2 + RDS)", category: "Infrastructure", cost: 420, billing: "monthly", status: "active" },
    { id: "s2", name: "Supabase Pro", category: "Database", cost: 25, billing: "monthly", status: "active" },
    { id: "s3", name: "Stripe", category: "Payments", cost: 0, billing: "per-transaction", status: "active" },
    { id: "s4", name: "Firebase", category: "Notifications", cost: 15, billing: "monthly", status: "active" },
    { id: "s5", name: "Vercel Pro", category: "Hosting", cost: 20, billing: "monthly", status: "active" },
    { id: "s6", name: "Sentry", category: "Monitoring", cost: 26, billing: "monthly", status: "active" }
  ],
  recentChanges: [
    { id: "rc1", title: "Manager approval required for driver assignment", status: "accepted", timeAgo: "2d ago" },
    { id: "rc2", title: "Pro subscription deferred to v2", status: "accepted", timeAgo: "3d ago" },
    { id: "rc3", title: "OAuth removed from v1 scope", status: "accepted", timeAgo: "5d ago" },
    { id: "rc4", title: "Promo code system requested", status: "pending", timeAgo: "2h ago" }
  ],
  brainStatus: "ACTIVE",
  docsCount: 8,
  docsReady: 6
};

export const mockDocs: Doc[] = [
  {
    id: "1",
    name: "BloomFast PRD v2",
    type: "prd",
    size: "2.4 MB",
    pages: 24,
    status: "ready",
    uploadedBy: "SC",
    uploadedAt: "Apr 18, 2026",
    excerpt:
      "BloomFast is an on-demand flower delivery marketplace connecting buyers to local florists. Client wants an MVP with buyer-facing ordering, florist-facing order management, and driver assignment."
  },
  {
    id: "2",
    name: "SRS Document",
    type: "srs",
    size: "1.8 MB",
    pages: 18,
    status: "ready",
    uploadedBy: "MT",
    uploadedAt: "Apr 17, 2026",
    excerpt:
      "System requirements for BloomFast MVP. Covers authentication, order flow, payment integration, and driver assignment module specifications."
  },
  {
    id: "3",
    name: "Tech Architecture Spec",
    type: "spec",
    size: "980 KB",
    pages: 12,
    status: "ready",
    uploadedBy: "SC",
    uploadedAt: "Apr 16, 2026",
    excerpt:
      "Working end-to-end order flow for buyers and florists. No Pro subscription in MVP. Manager approval required before driver assignment."
  },
  {
    id: "4",
    name: "Client Kickoff Call",
    type: "transcript",
    size: "340 KB",
    pages: 8,
    status: "ready",
    uploadedBy: "SC",
    uploadedAt: "Apr 15, 2026",
    excerpt:
      "Hey Sarah - one thing we forgot to mention. We need manager approval before any driver gets assigned to an order. The florist manager has to sign off first."
  },
  {
    id: "5",
    name: "Design Mockups v3",
    type: "image",
    size: "14.2 MB",
    pages: 1,
    status: "ready",
    uploadedBy: "JW",
    uploadedAt: "Apr 14, 2026",
    excerpt: "Design mockups v3 — buyer ordering flow, florist dashboard, and driver assignment screens."
  },
  {
    id: "6",
    name: "Sprint 2 Recording",
    type: "audio",
    size: "48 MB",
    pages: 1,
    status: "processing",
    uploadedBy: "MT",
    uploadedAt: "Apr 21, 2026",
    excerpt: "Sprint 2 standup recording. Processing in progress."
  },
  {
    id: "7",
    name: "Payment Flow Diagram",
    type: "image",
    size: "3.1 MB",
    pages: 1,
    status: "ready",
    uploadedBy: "PK",
    uploadedAt: "Apr 13, 2026",
    excerpt:
      "Can we add a Pro subscription for florists with better revenue share? Like 85% instead of 70%? I think it really helps retention."
  },
  {
    id: "8",
    name: "Stakeholder Email Thread",
    type: "transcript",
    size: "120 KB",
    pages: 3,
    status: "ready",
    uploadedBy: "SC",
    uploadedAt: "Apr 12, 2026",
    excerpt: "Stakeholder alignment on scope. OAuth removed from v1. Payment flow confirmed with Stripe."
  }
];

export const mockFlowGraph: FlowGraph = {
  nodes: [
    {
      id: "n01",
      label: "Buyer Ordering Flow",
      type: "flow",
      status: "critical",
      description:
        "End-to-end buyer journey from product browse to checkout. Includes cart, address selection, payment, and order confirmation.",
      docRefs: ["PRD v2 — Section 3.1", "SRS — Section 5"],
      position: { x: 340, y: 180 }
    },
    {
      id: "n02",
      label: "Florist Dashboard",
      type: "module",
      status: "critical",
      description:
        "Florist-facing order management interface. Shows incoming orders, fulfillment status, and inventory management.",
      docRefs: ["PRD v2 — Section 3.2"],
      position: { x: 580, y: 180 }
    },
    {
      id: "n03",
      label: "Driver Assignment",
      type: "flow",
      status: "at-risk",
      description:
        "Automated and manual driver assignment logic. Manager approval required before any driver is assigned to an order.",
      docRefs: ["SRS — Section 7", "Client Kickoff Transcript"],
      position: { x: 820, y: 300 }
    },
    {
      id: "n04",
      label: "Payment Integration",
      type: "integration",
      status: "critical",
      description: "Stripe payment integration. Covers buyer checkout, florist payouts, and revenue share model.",
      docRefs: ["Tech Spec — Section 4"],
      position: { x: 120, y: 300 }
    },
    {
      id: "n05",
      label: "Subscription Model",
      type: "module",
      status: "unresolved",
      description: "Pro subscription for florists. Revenue share percentages still under discussion. Not in MVP v1 scope.",
      docRefs: ["Stakeholder Email Thread"],
      position: { x: 580, y: 420 }
    },
    {
      id: "n06",
      label: "Admin Panel",
      type: "approval",
      status: "stable",
      description: "Internal admin dashboard for order oversight, dispute resolution, and manager approval workflows.",
      docRefs: ["PRD v2 — Section 6"],
      position: { x: 1020, y: 180 }
    },
    {
      id: "n07",
      label: "Notifications",
      type: "integration",
      status: "stable",
      description: "Push and email notifications for buyers and florists. Order status updates, delivery confirmations.",
      docRefs: ["SRS — Section 8"],
      position: { x: 340, y: 420 }
    },
    {
      id: "n08",
      label: "Third-party Driver API",
      type: "integration",
      status: "unresolved",
      description: "External driver network API integration. Provider not confirmed. Availability and pricing TBD.",
      docRefs: ["Tech Spec — Section 9"],
      position: { x: 820, y: 480 }
    }
  ],
  edges: [
    { id: "e1", from: "n01", to: "n02", label: "creates order", style: "dashed" },
    { id: "e2", from: "n02", to: "n03", label: "confirms", style: "dashed" },
    { id: "e3", from: "n03", to: "n06", label: "exceptions", style: "solid" },
    { id: "e4", from: "n01", to: "n04", label: "checkout", style: "solid" },
    { id: "e5", from: "n02", to: "n07", label: "alerts florist", style: "solid" },
    { id: "e6", from: "n07", to: "n05", label: "", style: "solid" },
    { id: "e7", from: "n03", to: "n08", label: "availability", style: "dashed" }
  ]
};

export const mockDocViewer: DocViewerPayload = {
  id: "1",
  title: "BloomFast PRD v2",
  version: "v2.1",
  uploadedBy: "Sarah Chen",
  uploadedAt: "Apr 18, 2026",
  totalPages: 24,
  sections: [
    {
      id: "s1",
      anchorId: "overview",
      type: "heading",
      level: 1,
      content: "BloomFast — Product Requirements Document",
      hasChange: false
    },
    {
      id: "s2",
      anchorId: "summary",
      type: "paragraph",
      content:
        "BloomFast is an on-demand flower delivery marketplace connecting buyers to local florists. The platform enables buyer-facing ordering, florist-facing order management, and driver assignment with real-time tracking.",
      hasChange: false
    },
    {
      id: "s3",
      anchorId: "scope",
      type: "heading",
      level: 2,
      content: "1. Product Scope",
      hasChange: false
    },
    {
      id: "s4",
      anchorId: "scope-detail",
      type: "paragraph",
      content:
        "The MVP covers three primary user flows: buyer ordering, florist dashboard, and driver assignment. Payment processing via Stripe. No Pro subscription in v1.",
      hasChange: true,
      changeId: "c1",
      citationIds: ["cite-1"]
    },
    {
      id: "s5",
      anchorId: "auth",
      type: "heading",
      level: 2,
      content: "2. Authentication",
      hasChange: false
    },
    {
      id: "s6",
      anchorId: "auth-detail",
      type: "paragraph",
      content: "OAuth 2.0 with Google SSO for buyers. Email/password for florists and drivers. JWT tokens with 24hr expiry.",
      hasChange: true,
      changeId: "c2",
      citationIds: ["cite-2"]
    },
    {
      id: "s7",
      anchorId: "driver",
      type: "heading",
      level: 2,
      content: "3. Driver Assignment",
      hasChange: false
    },
    {
      id: "s8",
      anchorId: "driver-detail",
      type: "paragraph",
      content:
        "Drivers are assigned automatically based on proximity and availability. Manager approval required before assignment is confirmed. Florist manager must sign off on each order.",
      hasChange: true,
      changeId: "c3",
      citationIds: ["cite-3"]
    },
    {
      id: "s9",
      anchorId: "payments",
      type: "heading",
      level: 2,
      content: "4. Payment Integration",
      hasChange: false
    },
    {
      id: "s10",
      anchorId: "payments-detail",
      type: "paragraph",
      content: "Stripe Connect for buyer payments and florist payouts. Revenue share: 70% florist, 30% platform. Payout batching weekly.",
      hasChange: false
    },
    {
      id: "s11",
      anchorId: "notifications",
      type: "heading",
      level: 2,
      content: "5. Notifications",
      hasChange: false
    },
    {
      id: "s12",
      anchorId: "notifications-detail",
      type: "paragraph",
      content:
        "SMS notifications for order status updates. Email confirmations for buyers. Push notifications for florists and drivers via Firebase.",
      hasChange: false
    }
  ]
};

export const mockProvenance: Record<string, AnchorProvenance> = {
  "scope-detail": {
    anchorId: "scope-detail",
    sourceDoc: "BloomFast PRD v2 — Section 1",
    excerpt: "No Pro subscription in v1.",
    linkedMessages: [
      {
        id: "m1",
        from: "Jack (BloomFast)",
        platform: "slack",
        content: "Confirmed — no Pro subscription for MVP. Keep it simple for launch.",
        sentAt: "Apr 14, 2026"
      }
    ],
    acceptedChanges: [
      {
        id: "c1",
        summary: "Pro subscription deferred to v2",
        acceptedAt: "Apr 15, 2026",
        acceptedBy: "Sarah Chen"
      }
    ]
  },
  "auth-detail": {
    anchorId: "auth-detail",
    sourceDoc: "BloomFast PRD v2 — Section 2",
    excerpt: "OAuth removed from v1 scope.",
    linkedMessages: [
      {
        id: "m2",
        from: "Mike (API Gateway)",
        platform: "email",
        content: "Confirmed: remove OAuth from v1 scope. Email/password is sufficient for launch.",
        sentAt: "Apr 16, 2026"
      }
    ],
    acceptedChanges: [
      {
        id: "c2",
        summary: "OAuth removed from MVP, email/password only",
        acceptedAt: "Apr 16, 2026",
        acceptedBy: "Sarah Chen"
      }
    ]
  },
  "driver-detail": {
    anchorId: "driver-detail",
    sourceDoc: "Client Kickoff Transcript",
    excerpt: "Manager approval before driver assignment.",
    linkedMessages: [
      {
        id: "m3",
        from: "Jack (BloomFast)",
        platform: "whatsapp",
        content:
          "Hey Sarah - one thing we forgot to mention. We need manager approval before any driver gets assigned. The florist manager has to sign off first.",
        sentAt: "Apr 14, 2026"
      }
    ],
    acceptedChanges: [
      {
        id: "c3",
        summary: "Manager approval required before driver assignment",
        acceptedAt: "Apr 15, 2026",
        acceptedBy: "Sarah Chen"
      }
    ]
  }
};

export const mockLiveDoc: LiveDocPayload = {
  projectName: "BloomFast",
  docType: "PRD",
  version: "V1.2",
  status: "DRAFT",
  sections: [
    {
      id: "sec-title",
      anchorId: "title",
      sectionLabel: "",
      type: "title",
      content: "BloomFast delivery console",
      sourceIds: []
    },
    {
      id: "sec-overview",
      anchorId: "overview",
      sectionLabel: "",
      type: "body",
      content:
        "A dispatch-first web app for coordinating florist pickups, driver routes, and customer notifications across a single metro day-part model. The experience should feel calm under peak load and obvious when something needs human attention.",
      sourceIds: ["c1"]
    },
    {
      id: "sec-goals-label",
      anchorId: "goals",
      sectionLabel: "GOALS",
      type: "section-heading",
      content: "",
      sourceIds: []
    },
    {
      id: "sec-goals",
      anchorId: "goals-body",
      sectionLabel: "",
      type: "highlighted",
      content:
        "Reduce missed same-day deliveries by giving dispatch a real-time view of capacity before 10:00 local, with guardrails when driver supply drops. Dispatchers should always see the next best action without opening secondary tools.",
      highlight: {
        text: "real-time view of capacity before 10:00 local",
        start: 67,
        end: 112
      },
      sourceIds: ["c1"]
    },
    {
      id: "sec-catalog-label",
      anchorId: "catalog",
      sectionLabel: "CATALOG & INTEGRATIONS",
      type: "section-heading",
      content: "",
      sourceIds: []
    },
    {
      id: "sec-catalog",
      anchorId: "catalog-body",
      sectionLabel: "",
      type: "highlighted",
      content:
        "Product catalog syncs from Shopify as the canonical SKU source. Warehouse inventory is polled every five minutes; writebacks are admin-only. Any mismatch surfaces as a single-line exception with a deep link to the originating order.",
      highlight: {
        text: "Shopify as the canonical SKU source",
        start: 27,
        end: 62
      },
      sourceIds: ["c2"]
    },
    {
      id: "sec-auth-label",
      anchorId: "auth",
      sectionLabel: "AUTHENTICATION",
      type: "section-heading",
      content: "",
      sourceIds: []
    },
    {
      id: "sec-auth",
      anchorId: "auth-body",
      sectionLabel: "",
      type: "body",
      content: "OAuth removed from v1 scope. Email and password authentication for all user types. JWT tokens with 24-hour expiry.",
      sourceIds: []
    },
    {
      id: "sec-payments-label",
      anchorId: "payments",
      sectionLabel: "PAYMENTS",
      type: "section-heading",
      content: "",
      sourceIds: []
    },
    {
      id: "sec-payments",
      anchorId: "payments-body",
      sectionLabel: "",
      type: "body",
      content:
        "Driver payouts must never block dispatch — if payout fails, queue and retry without cancelling the route. Stripe Connect for buyer payments and florist payouts. Revenue share: 70% florist, 30% platform.",
      sourceIds: ["c3"]
    },
    {
      id: "sec-driver-label",
      anchorId: "driver",
      sectionLabel: "DRIVER ASSIGNMENT",
      type: "section-heading",
      content: "",
      sourceIds: []
    },
    {
      id: "sec-driver",
      anchorId: "driver-body",
      sectionLabel: "",
      type: "highlighted",
      content:
        "Drivers are matched to orders based on proximity, availability, and shift status. Manager approval is required before any driver is confirmed on an order. Florist manager must sign off. If a driver declines, the system automatically re-queues and finds the next closest available driver.",
      highlight: {
        text: "Manager approval is required before any driver is confirmed",
        start: 89,
        end: 148
      },
      sourceIds: ["c4"]
    },
    {
      id: "sec-notifications-label",
      anchorId: "notifications",
      sectionLabel: "NOTIFICATIONS",
      type: "section-heading",
      content: "",
      sourceIds: []
    },
    {
      id: "sec-notifications",
      anchorId: "notifications-body",
      sectionLabel: "",
      type: "body",
      content:
        "SMS notifications trigger at three points: order confirmed, driver en route, and delivery complete. Email confirmation sent to buyer at order placement. Push notifications to florists and drivers via Firebase Cloud Messaging. Notification failures must not block dispatch.",
      sourceIds: ["c5"]
    },
    {
      id: "sec-scope-label",
      anchorId: "scope",
      sectionLabel: "V1 SCOPE BOUNDARIES",
      type: "section-heading",
      content: "",
      sourceIds: []
    },
    {
      id: "sec-scope",
      anchorId: "scope-body",
      sectionLabel: "",
      type: "body",
      content:
        "V1 is single-metro only. No Pro subscription for florists in v1 — deferred to v2. OAuth removed from scope — email and password only. Multi-driver routing and cross-region pooling deferred. Native mobile apps for drivers deferred — web-only for launch.",
      sourceIds: ["c1"]
    },
    {
      id: "sec-diagrams-label",
      anchorId: "diagrams",
      sectionLabel: "SYSTEM DIAGRAMS",
      type: "section-heading",
      content: "",
      sourceIds: []
    }
  ],
  comments: [
    {
      id: "c1",
      authorInitials: "MC",
      authorName: "Maya Chen",
      time: "9:14 AM",
      date: "12 Mar 2026",
      content:
        "We need same-day slots before 10am to feel credible for florists. If we miss that window, they won't trust us.",
      source: 'Slack #bloomfast-client — thread "Same-day credibility"',
      linkedSectionId: "sec-goals"
    },
    {
      id: "c2",
      authorInitials: "N",
      authorName: "Notes",
      time: "2:08 PM",
      date: "14 Mar 2026",
      content: "Confirmed Shopify is source of truth for SKUs; anything else is read-only mirror.",
      source: "Kickoff call transcript (internal)",
      linkedSectionId: "sec-catalog"
    },
    {
      id: "c3",
      authorInitials: "JL",
      authorName: "Jordan Lee",
      time: "11:22 AM",
      date: "18 Mar 2026",
      content:
        "Driver payouts must never block dispatch — if payout fails, queue and retry without cancelling the route.",
      source: 'Email ops@bloomfast.co — subject "Payouts vs dispatch"',
      linkedSectionId: "sec-payments"
    },
    {
      id: "c4",
      authorInitials: "JB",
      authorName: "Jack BloomFast",
      time: "3:18 PM",
      date: "18 Mar 2026",
      content:
        "Manager approval is required before any driver is confirmed on an order. If a florist manager rejects it, the system should immediately re-queue and find the next closest available driver.",
      source: "Kickoff follow-up — WhatsApp thread",
      linkedSectionId: "sec-driver"
    },
    {
      id: "c5",
      authorInitials: "SC",
      authorName: "Sarah Chen",
      time: "10:30 AM",
      date: "19 Mar 2026",
      content: "Notification failures must never block dispatch. Queue and retry independently.",
      source: "Internal design review — Slack #engineering",
      linkedSectionId: "sec-notifications"
    }
  ]
};

function createDetailItems(
  prefix: string,
  items: Array<{ label: string; description: string; action: BrainDetailItem["action"] }>
) {
  return items.map((item, index) => ({
    id: `${prefix}-${index + 1}`,
    label: item.label,
    description: item.description,
    action: item.action
  }));
}

function createCategoryNode({
  id,
  label,
  x,
  y,
  icon,
  accentColor,
  tooltip,
  countLabel,
  detailItems
}: {
  id: BrainNodeData["id"];
  label: BrainNodeData["label"];
  x: number;
  y: number;
  icon: NonNullable<BrainNodeData["icon"]>;
  accentColor: string;
  tooltip: string;
  countLabel: string;
  detailItems: BrainDetailItem[];
}): BrainNodeData {
  return {
    id,
    kind: "category",
    label,
    x,
    y,
    size: 52,
    category: id as BrainNodeData["category"],
    icon,
    background: "#ffffff",
    borderColor: "#e5e5e0",
    textColor: "#888888",
    accentColor,
    shadow: "0 4px 16px rgba(0,0,0,0.08)",
    tooltip,
    countLabel,
    detailItems
  };
}

function createSubNode({
  id,
  parentId,
  category,
  label,
  x,
  y,
  background,
  borderColor,
  accentColor,
  tooltip,
  countLabel
}: {
  id: string;
  parentId: string;
  category: NonNullable<BrainNodeData["category"]>;
  label: string;
  x: number;
  y: number;
  background: string;
  borderColor: string;
  accentColor: string;
  tooltip: string;
  countLabel: string;
}): BrainNodeData {
  return {
    id,
    kind: "sub",
    label,
    x,
    y,
    size: 36,
    parentId,
    category,
    background,
    borderColor,
    textColor: "#333333",
    accentColor,
    shadow: "0 4px 14px rgba(0,0,0,0.06)",
    tooltip,
    countLabel
  };
}

function createProjectBrainData({
  projectId,
  projectName,
  docs,
  comms,
  team,
  changes,
  decisions
}: {
  projectId: string;
  projectName: string;
  docs: Array<{ label: string; description: string }>;
  comms: Array<{ label: string; description: string }>;
  team: Array<{ label: string; description: string }>;
  changes: Array<{ label: string; description: string; borderColor: string; accentColor: string }>;
  decisions: Array<{ label: string; description: string }>;
}): ProjectBrainData {
  const docsItems = createDetailItems("docs", docs.map((item) => ({ ...item, action: "navigate-docs" as const })));
  const commsItems = createDetailItems("comms", comms.map((item) => ({ ...item, action: "navigate-requests" as const })));
  const teamItems = createDetailItems("team", team.map((item) => ({ ...item, action: "detail" as const })));
  const changeItems = createDetailItems("changes", changes.map((item) => ({ ...item, action: "detail" as const })));
  const decisionItems = createDetailItems("decisions", decisions.map((item) => ({ ...item, action: "detail" as const })));

  return {
    projectId,
    projectName,
    nodes: [
      {
        id: "brain-core",
        kind: "core",
        label: "BRAIN",
        x: 50,
        y: 50,
        size: 80,
        background: "linear-gradient(135deg, #111827, #374151)",
        borderColor: "#ffffff",
        textColor: "#ffffff",
        accentColor: "#111827",
        shadow: "0 0 40px rgba(17,24,39,0.4), 0 8px 32px rgba(0,0,0,0.12)",
        tooltip: `${projectName} brain core`,
        countLabel: "5 active domains"
      },
      createCategoryNode({
        id: "docs",
        label: "DOCS",
        x: 50,
        y: 22,
        icon: "file-text",
        accentColor: "#111827",
        tooltip: `${projectName} docs`,
        countLabel: `${docsItems.length} linked docs`,
        detailItems: docsItems
      }),
      createCategoryNode({
        id: "comms",
        label: "COMMS",
        x: 72,
        y: 36,
        icon: "message-square",
        accentColor: "#8b7fd4",
        tooltip: `${projectName} comms`,
        countLabel: `${commsItems.length} active channels`,
        detailItems: commsItems
      }),
      createCategoryNode({
        id: "team",
        label: "TEAM",
        x: 65,
        y: 68,
        icon: "users",
        accentColor: "#f59340",
        tooltip: `${projectName} team`,
        countLabel: `${teamItems.length} active members`,
        detailItems: teamItems
      }),
      createCategoryNode({
        id: "changes",
        label: "CHANGES",
        x: 35,
        y: 68,
        icon: "git-branch",
        accentColor: "#e05555",
        tooltip: `${projectName} changes`,
        countLabel: `${changeItems.length} open updates`,
        detailItems: changeItems
      }),
      createCategoryNode({
        id: "decisions",
        label: "DECISIONS",
        x: 28,
        y: 36,
        icon: "check-square",
        accentColor: "#111827",
        tooltip: `${projectName} decisions`,
        countLabel: `${decisionItems.length} locked calls`,
        detailItems: decisionItems
      }),
      createSubNode({
        id: "docs-1",
        parentId: "docs",
        category: "docs",
        label: docs[0].label,
        x: 48,
        y: 8,
        background: "#e5e7eb",
        borderColor: "#e5e7eb",
        accentColor: "#111827",
        tooltip: docs[0].label,
        countLabel: "1 doc node"
      }),
      createSubNode({
        id: "docs-2",
        parentId: "docs",
        category: "docs",
        label: docs[1].label,
        x: 54,
        y: 8,
        background: "#e5e7eb",
        borderColor: "#e5e7eb",
        accentColor: "#111827",
        tooltip: docs[1].label,
        countLabel: "1 doc node"
      }),
      createSubNode({
        id: "docs-3",
        parentId: "docs",
        category: "docs",
        label: docs[2].label,
        x: 42,
        y: 12,
        background: "#e5e7eb",
        borderColor: "#e5e7eb",
        accentColor: "#111827",
        tooltip: docs[2].label,
        countLabel: "1 doc node"
      }),
      createSubNode({
        id: "comms-1",
        parentId: "comms",
        category: "comms",
        label: comms[0].label,
        x: 82,
        y: 28,
        background: "#e0dbf5",
        borderColor: "#e0dbf5",
        accentColor: "#8b7fd4",
        tooltip: comms[0].label,
        countLabel: "1 channel node"
      }),
      createSubNode({
        id: "comms-2",
        parentId: "comms",
        category: "comms",
        label: comms[1].label,
        x: 84,
        y: 42,
        background: "#e0dbf5",
        borderColor: "#e0dbf5",
        accentColor: "#8b7fd4",
        tooltip: comms[1].label,
        countLabel: "1 channel node"
      }),
      createSubNode({
        id: "comms-3",
        parentId: "comms",
        category: "comms",
        label: comms[2].label,
        x: 76,
        y: 26,
        background: "#e0dbf5",
        borderColor: "#e0dbf5",
        accentColor: "#8b7fd4",
        tooltip: comms[2].label,
        countLabel: "1 channel node"
      }),
      createSubNode({
        id: "team-1",
        parentId: "team",
        category: "team",
        label: team[0].label,
        x: 72,
        y: 76,
        background: "#fceee4",
        borderColor: "#fceee4",
        accentColor: "#f59340",
        tooltip: team[0].label,
        countLabel: "1 team node"
      }),
      createSubNode({
        id: "team-2",
        parentId: "team",
        category: "team",
        label: team[1].label,
        x: 64,
        y: 82,
        background: "#fceee4",
        borderColor: "#fceee4",
        accentColor: "#f59340",
        tooltip: team[1].label,
        countLabel: "1 team node"
      }),
      createSubNode({
        id: "team-3",
        parentId: "team",
        category: "team",
        label: team[2].label,
        x: 56,
        y: 74,
        background: "#fceee4",
        borderColor: "#fceee4",
        accentColor: "#f59340",
        tooltip: team[2].label,
        countLabel: "1 team node"
      }),
      createSubNode({
        id: "changes-1",
        parentId: "changes",
        category: "changes",
        label: changes[0].label,
        x: 28,
        y: 78,
        background: "#fff0f0",
        borderColor: changes[0].borderColor,
        accentColor: changes[0].accentColor,
        tooltip: changes[0].label,
        countLabel: "1 change node"
      }),
      createSubNode({
        id: "changes-2",
        parentId: "changes",
        category: "changes",
        label: changes[1].label,
        x: 20,
        y: 68,
        background: "#fff0f0",
        borderColor: changes[1].borderColor,
        accentColor: changes[1].accentColor,
        tooltip: changes[1].label,
        countLabel: "1 change node"
      }),
      createSubNode({
        id: "decisions-1",
        parentId: "decisions",
        category: "decisions",
        label: decisions[0].label,
        x: 16,
        y: 28,
        background: "#e5e7eb",
        borderColor: "#e5e7eb",
        accentColor: "#111827",
        tooltip: decisions[0].label,
        countLabel: "1 decision node"
      }),
      createSubNode({
        id: "decisions-2",
        parentId: "decisions",
        category: "decisions",
        label: decisions[1].label,
        x: 22,
        y: 22,
        background: "#e5e7eb",
        borderColor: "#e5e7eb",
        accentColor: "#111827",
        tooltip: decisions[1].label,
        countLabel: "1 decision node"
      })
    ]
  };
}

export const mockProjectBrains: Record<string, ProjectBrainData> = {
  "1": createProjectBrainData({
    projectId: "1",
    projectName: "BloomFast MVP",
    docs: [
      { label: "PRD v2", description: "Product scope, milestones, and launch priorities." },
      { label: "SRS", description: "Functional requirements and delivery constraints." },
      { label: "Tech Spec", description: "Architecture notes for checkout and onboarding." }
    ],
    comms: [
      { label: "Slack", description: "Daily team threads and sprint planning updates." },
      { label: "Gmail", description: "Client approvals and release notes." },
      { label: "WhatsApp", description: "Fast-turn client feedback on launch blockers." }
    ],
    team: [
      { label: "SC", description: "Sarah Chen coordinating delivery and client approvals." },
      { label: "MT", description: "Marcus T owns backend integrations and QA handoff." },
      { label: "PK", description: "Priya K drives dashboard and onboarding UI." }
    ],
    changes: [
      { label: "Promo code", description: "Requested checkout discount support for launch week.", borderColor: "#e05555", accentColor: "#e05555" },
      { label: "Dark mode", description: "Low-priority UI refresh queued after v1 lock.", borderColor: "#f59340", accentColor: "#f59340" }
    ],
    decisions: [
      { label: "OAuth removed", description: "OAuth is out of v1 to reduce auth complexity." },
      { label: "v1 scope locked", description: "No new launch-critical features after QA freeze." }
    ]
  }),
  "2": createProjectBrainData({
    projectId: "2",
    projectName: "Elara Games",
    docs: [
      { label: "Game Loop", description: "Core progression systems and player loop notes." },
      { label: "SRS", description: "Technical requirements for gameplay APIs and UI." },
      { label: "Launch Plan", description: "Soft launch checklist and platform dependencies." }
    ],
    comms: [
      { label: "Slack", description: "Internal build reviews and bug triage." },
      { label: "Gmail", description: "Publisher approvals and art handoff notes." },
      { label: "WhatsApp", description: "Urgent launch-day coordination with stakeholders." }
    ],
    team: [
      { label: "SC", description: "Sarah Chen aligning roadmap and stakeholder feedback." },
      { label: "JW", description: "James W handling frontend systems and release prep." },
      { label: "PK", description: "Priya K leading product flows and UI polish." }
    ],
    changes: [
      { label: "HUD polish", description: "Late-stage UI cleanup before external testing.", borderColor: "#e05555", accentColor: "#e05555" },
      { label: "Dark mode", description: "Experimental theme work parked behind release tasks.", borderColor: "#f59340", accentColor: "#f59340" }
    ],
    decisions: [
      { label: "PvP deferred", description: "Competitive mode moves to the post-launch roadmap." },
      { label: "v1 scope locked", description: "Content freeze is active for first release." }
    ]
  }),
  "3": createProjectBrainData({
    projectId: "3",
    projectName: "API Gateway",
    docs: [
      { label: "Auth RFC", description: "Gateway auth model and service ownership." },
      { label: "SRS", description: "Throughput, uptime, and observability requirements." },
      { label: "Tech Spec", description: "Webhook retries and rate-limit design notes." }
    ],
    comms: [
      { label: "Slack", description: "Infra reviews and daily incident notes." },
      { label: "Gmail", description: "Enterprise integration threads and approvals." },
      { label: "WhatsApp", description: "Fast escalation path for client-side outages." }
    ],
    team: [
      { label: "SC", description: "Sarah Chen coordinating launch dependencies." },
      { label: "MT", description: "Marcus T leading backend rollout and auth migration." },
      { label: "AP", description: "Alex P supporting API testing and delivery QA." }
    ],
    changes: [
      { label: "OAuth removed", description: "Scope trimmed to ship the core auth module.", borderColor: "#e05555", accentColor: "#e05555" },
      { label: "Retry queues", description: "Resilience update for webhook delivery failures.", borderColor: "#f59340", accentColor: "#f59340" }
    ],
    decisions: [
      { label: "Spec frozen", description: "Gateway contract is frozen until partner review clears." },
      { label: "v1 scope locked", description: "Only reliability fixes can land before release." }
    ]
  })
};

export const mockDeadlines: DeadlineItem[] = [
  { id: "1", project: "BloomFast MVP", task: "Payment integration", dueDate: "Apr 24", daysLeft: 3, status: "on-track" },
  { id: "2", project: "API Gateway", task: "Auth module handoff", dueDate: "Apr 26", daysLeft: 5, status: "at-risk" },
  { id: "3", project: "Elara Games", task: "Dashboard v2 delivery", dueDate: "May 2", daysLeft: 11, status: "on-track" }
];

export const mockRequests: RequestItem[] = [
  {
    id: "1",
    from: "Jack — BloomFast",
    message: "Can we add a promo code system to checkout?",
    time: "2h ago",
    status: "pending",
    platform: "slack"
  },
  {
    id: "2",
    from: "Elena — Elara Games",
    message: "Need dark mode support across dashboard",
    time: "5h ago",
    status: "pending",
    platform: "email"
  },
  {
    id: "3",
    from: "Mike — API Gateway",
    message: "Confirmed: remove OAuth from v1 scope",
    time: "1d ago",
    status: "accepted",
    platform: "slack"
  },
  {
    id: "4",
    from: "Jack — BloomFast",
    message: "Florist onboarding flow needs a tutorial step",
    time: "2d ago",
    status: "accepted",
    platform: "whatsapp"
  }
];

export const mockMeetings: MeetingItem[] = [
  { id: "1", title: "BloomFast Standup", time: "9:00 AM", duration: "15 min", type: "standup", project: "BloomFast" },
  { id: "2", title: "API Gateway Review", time: "11:30 AM", duration: "45 min", type: "review", project: "API Gateway" },
  { id: "3", title: "Client Sync — Elara", time: "2:00 PM", duration: "30 min", type: "client", project: "Elara Games" }
];

export const mockCalendarEvents: Record<string, CalendarDayData> = {
  "2026-04-21": {
    meetings: [
      { id: "1", title: "BloomFast Standup", time: "9:00 AM", duration: "15 min", type: "standup", project: "BloomFast" },
      { id: "2", title: "API Gateway Review", time: "11:30 AM", duration: "45 min", type: "review", project: "API Gateway" },
      { id: "3", title: "Client Sync — Elara", time: "2:00 PM", duration: "30 min", type: "client", project: "Elara Games" }
    ],
    deadlines: []
  },
  "2026-04-22": {
    meetings: [
      { id: "4", title: "Sprint Planning", time: "10:00 AM", duration: "60 min", type: "meeting", project: "BloomFast" }
    ],
    deadlines: []
  },
  "2026-04-24": {
    meetings: [
      { id: "5", title: "Elara Design Review", time: "3:00 PM", duration: "30 min", type: "review", project: "Elara Games" }
    ],
    deadlines: [mockDeadlines[0]]
  },
  "2026-04-26": {
    meetings: [],
    deadlines: [mockDeadlines[1]]
  },
  "2026-05-02": {
    meetings: [],
    deadlines: [mockDeadlines[2]]
  }
};

export const mockRoles: RoleOption[] = [
  { key: "manager", label: "MANAGER", icon: "briefcase" },
  { key: "dev", label: "DEV", icon: "code" },
  { key: "client", label: "CLIENT", icon: "eye" }
];

export const mockSocratesSuggestions: SocratesSuggestionGroups = {
  dashboard: [
    "What's due soon?",
    "Any pending requests?",
    "Today's meetings?"
  ],
  project: [
    "What's due soon?",
    "Any pending requests?",
    "Today's meetings?"
  ]
};

export const mockSocratesReplies: SocratesReplyGroups = {
  dashboard: "I can summarize your deadlines, outstanding requests, and today's meetings from the current product state once the backend is connected.",
  project: "I can summarize your deadlines, outstanding requests, and today's meetings from the current product state once the backend is connected."
};

export const mockSocratesMessages: ChatMessage[] = [];
