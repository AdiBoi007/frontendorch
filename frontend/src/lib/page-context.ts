import type { SocratesPageContext, SocratesSelectedRefType, SocratesViewerState } from "./api/socrates";

export interface SocratesContextState {
  pageContext: SocratesPageContext;
  selectedRefType: SocratesSelectedRefType | null;
  selectedRefId: string | null;
  viewerState: SocratesViewerState | null;
}

export function resolveRouteProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

export function replaceProjectIdInPath(pathname: string, nextProjectId: string) {
  return pathname.replace(/^\/projects\/[^/]+/, `/projects/${nextProjectId}`);
}

export function resolveSocratesContextFromPath(pathname: string): SocratesContextState | null {
  if (pathname === "/dashboard") {
    return {
      pageContext: "dashboard_general",
      selectedRefType: null,
      selectedRefId: null,
      viewerState: null,
    };
  }

  const projectDashboard = pathname.match(/^\/projects\/([^/]+)\/dashboard$/);
  if (projectDashboard) {
    return {
      pageContext: "dashboard_project",
      selectedRefType: "dashboard_scope",
      selectedRefId: projectDashboard[1],
      viewerState: null,
    };
  }

  const brain = pathname.match(/^\/projects\/([^/]+)\/brain$/);
  if (brain) {
    return {
      pageContext: "brain_overview",
      selectedRefType: null,
      selectedRefId: null,
      viewerState: null,
    };
  }

  const flow = pathname.match(/^\/projects\/([^/]+)\/flow$/);
  if (flow) {
    return {
      pageContext: "brain_graph",
      selectedRefType: null,
      selectedRefId: null,
      viewerState: null,
    };
  }

  const liveDoc = pathname.match(/^\/projects\/([^/]+)\/live-doc$/);
  if (liveDoc) {
    return {
      pageContext: "live_doc",
      selectedRefType: null,
      selectedRefId: null,
      viewerState: null,
    };
  }

  const docViewer = pathname.match(/^\/projects\/([^/]+)\/docs\/([^/]+)\/view$/);
  if (docViewer) {
    const documentId = docViewer[2];
    return {
      pageContext: "doc_viewer",
      selectedRefType: "document",
      selectedRefId: documentId,
      viewerState: {
        documentId,
      },
    };
  }

  const memory = pathname.match(/^\/projects\/([^/]+)\/memory$/);
  if (memory) {
    return {
      pageContext: "doc_viewer",
      selectedRefType: null,
      selectedRefId: null,
      viewerState: null,
    };
  }

  const requests = pathname.match(/^\/projects\/([^/]+)\/requests$/);
  if (requests) {
    return {
      pageContext: "dashboard_project",
      selectedRefType: "dashboard_scope",
      selectedRefId: requests[1],
      viewerState: null,
    };
  }

  return null;
}
