import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGetProject, apiGetProjectMembers, apiListProjects, type ProjectDetail, type ProjectListItem, type ProjectMembersResponse, type WorkspaceRole } from "../lib/api/projects";
import { ApiError } from "../lib/http";
import { resolveRouteProjectId, replaceProjectIdInPath } from "../lib/page-context";
import { getRememberedProjectId, setRememberedProjectId } from "../lib/project-storage";
import { useAuth } from "./AuthContext";

export type ShellBootstrapState =
  | "bootstrapping_auth"
  | "bootstrapping_projects"
  | "ready"
  | "no_projects"
  | "unauthenticated"
  | "fatal_error";

interface AppShellContextValue {
  status: ShellBootstrapState;
  projects: ProjectListItem[];
  activeProjectId: string | null;
  activeProject: ProjectListItem | null;
  routeProjectId: string | null;
  currentRole: WorkspaceRole | null;
  routeProjectAccessible: boolean;
  routeProjectMissing: boolean;
  projectDetail: ProjectDetail | null;
  projectMembers: ProjectMembersResponse | null;
  projectDataLoading: boolean;
  projectsError: string | null;
  isManager: boolean;
  isDev: boolean;
  isClient: boolean;
  hasInternalAppAccess: boolean;
  selectProject: (projectId: string) => void;
  retryProjects: () => Promise<void>;
  getProjectMembership: (projectId: string) => WorkspaceRole | null;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

function getProjectsErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to load projects.";
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [preferredProjectId, setPreferredProjectIdState] = useState<string | null>(() => getRememberedProjectId());
  const [detailCache, setDetailCache] = useState<Record<string, ProjectDetail>>({});
  const [membersCache, setMembersCache] = useState<Record<string, ProjectMembersResponse>>({});
  const [projectDataLoading, setProjectDataLoading] = useState(false);
  const loadingProjectRef = useRef<string | null>(null);

  const routeProjectId = useMemo(() => resolveRouteProjectId(location.pathname), [location.pathname]);

  const loadProjects = useCallback(async () => {
    if (authStatus !== "authenticated") {
      setProjects([]);
      setProjectsLoaded(false);
      setProjectsError(null);
      return;
    }

    setProjectsError(null);
    setProjectsLoaded(false);
    try {
      const nextProjects = await apiListProjects();
      setProjects(nextProjects);
      setProjectsLoaded(true);
    } catch (error) {
      setProjects([]);
      setProjectsLoaded(true);
      setProjectsError(getProjectsErrorMessage(error));
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadProjects();
      return;
    }

    setProjects([]);
    setProjectsLoaded(false);
    setProjectsError(null);
    setDetailCache({});
    setMembersCache({});
  }, [authStatus, loadProjects]);

  const projectIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects]);
  const firstProjectId = projects[0]?.id ?? null;

  useEffect(() => {
    if (!projectsLoaded || projects.length === 0) {
      return;
    }

    const remembered = preferredProjectId;
    const nextPreferred =
      remembered && projectIds.has(remembered)
        ? remembered
        : routeProjectId && projectIds.has(routeProjectId)
          ? routeProjectId
          : firstProjectId;

    if (nextPreferred !== preferredProjectId) {
      setPreferredProjectIdState(nextPreferred);
      setRememberedProjectId(nextPreferred);
    }
  }, [firstProjectId, preferredProjectId, projectIds, projects.length, projectsLoaded, routeProjectId]);

  const getProjectMembership = useCallback(
    (projectId: string) => {
      const project = projects.find((candidate) => candidate.id === projectId);
      const membership = project?.members.find((member) => member.userId === user?.id && member.isActive);
      return membership?.projectRole ?? null;
    },
    [projects, user?.id]
  );

  const activeProjectId = useMemo(() => {
    if (routeProjectId && projectIds.has(routeProjectId)) {
      return routeProjectId;
    }
    if (preferredProjectId && projectIds.has(preferredProjectId)) {
      return preferredProjectId;
    }
    return firstProjectId;
  }, [firstProjectId, preferredProjectId, projectIds, routeProjectId]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const currentRole = useMemo(() => {
    if (routeProjectId && projectIds.has(routeProjectId)) {
      return getProjectMembership(routeProjectId);
    }
    if (activeProjectId) {
      return getProjectMembership(activeProjectId);
    }
    return user?.workspaceRoleDefault ?? null;
  }, [activeProjectId, getProjectMembership, projectIds, routeProjectId, user?.workspaceRoleDefault]);

  const routeProjectAccessible = routeProjectId ? projectIds.has(routeProjectId) : true;
  const routeProjectMissing = Boolean(routeProjectId) && projectsLoaded && !routeProjectAccessible;

  const ensureProjectData = useCallback(
    async (projectId: string) => {
      if (detailCache[projectId] && membersCache[projectId]) {
        return;
      }
      if (loadingProjectRef.current === projectId) {
        return;
      }

      loadingProjectRef.current = projectId;
      setProjectDataLoading(true);
      try {
        const [detail, members] = await Promise.all([
          detailCache[projectId] ? Promise.resolve(detailCache[projectId]) : apiGetProject(projectId),
          membersCache[projectId] ? Promise.resolve(membersCache[projectId]) : apiGetProjectMembers(projectId),
        ]);
        setDetailCache((current) => ({ ...current, [projectId]: detail }));
        setMembersCache((current) => ({ ...current, [projectId]: members }));
      } finally {
        loadingProjectRef.current = null;
        setProjectDataLoading(false);
      }
    },
    [detailCache, membersCache]
  );

  useEffect(() => {
    if (authStatus !== "authenticated" || !activeProjectId || routeProjectMissing) {
      return;
    }
    void ensureProjectData(activeProjectId);
  }, [activeProjectId, authStatus, ensureProjectData, routeProjectMissing]);

  const selectProject = useCallback(
    (projectId: string) => {
      if (!projectIds.has(projectId)) {
        return;
      }

      setPreferredProjectIdState(projectId);
      setRememberedProjectId(projectId);

      if (routeProjectId) {
        navigate(replaceProjectIdInPath(location.pathname, projectId));
      }
    },
    [location.pathname, navigate, projectIds, routeProjectId]
  );

  const status: ShellBootstrapState = useMemo(() => {
    if (authStatus === "bootstrapping") {
      return "bootstrapping_auth";
    }
    if (authStatus !== "authenticated") {
      return "unauthenticated";
    }
    if (!projectsLoaded) {
      return "bootstrapping_projects";
    }
    if (projectsError) {
      return "fatal_error";
    }
    if (projects.length === 0) {
      return "no_projects";
    }
    return "ready";
  }, [authStatus, projects.length, projectsError, projectsLoaded]);

  const value = useMemo<AppShellContextValue>(
    () => ({
      status,
      projects,
      activeProjectId,
      activeProject,
      routeProjectId,
      currentRole,
      routeProjectAccessible,
      routeProjectMissing,
      projectDetail: activeProjectId ? detailCache[activeProjectId] ?? null : null,
      projectMembers: activeProjectId ? membersCache[activeProjectId] ?? null : null,
      projectDataLoading,
      projectsError,
      isManager: user?.workspaceRoleDefault === "manager",
      isDev: user?.workspaceRoleDefault === "dev",
      isClient: user?.workspaceRoleDefault === "client",
      hasInternalAppAccess: user?.workspaceRoleDefault !== "client",
      selectProject,
      retryProjects: loadProjects,
      getProjectMembership,
    }),
    [
      activeProject,
      activeProjectId,
      currentRole,
      detailCache,
      getProjectMembership,
      loadProjects,
      location.pathname,
      membersCache,
      projectDataLoading,
      projects,
      projectsError,
      routeProjectAccessible,
      routeProjectId,
      routeProjectMissing,
      status,
      user?.workspaceRoleDefault,
    ]
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return context;
}
