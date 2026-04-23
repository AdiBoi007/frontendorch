import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { useAppShell } from "./context/AppShellContext";
import { AppShell } from "./components/shell/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { LiveDocPage } from "./pages/LiveDocPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LiveDocViewerPage } from "./pages/LiveDocViewerPage";
import { ProjectBrainPage } from "./pages/ProjectBrainPage";
import { ProjectMemoryPage } from "./pages/ProjectDocsPage";
import { ProjectDashboardPage } from "./pages/ProjectDashboardPage";
import { ProjectFlowchartPage } from "./pages/ProjectFlowchartPage";
import { ProjectRequestsPage } from "./pages/ProjectRequestsPage";
import { SettingsPage } from "./pages/SettingsPage";

function FullScreenState({
  title,
  message,
  actionLabel,
  onAction
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-bg px-6">
      <div className="max-w-[480px] rounded-lg border border-border bg-white p-8 text-center shadow-sm">
        <p className="font-sans text-label font-semibold uppercase text-text2">Orchestra</p>
        <h1 className="mt-3 font-sans text-[28px] font-bold leading-tight tracking-tight text-text1">{title}</h1>
        <p className="mt-3 font-sans text-docSm leading-6 text-textBody">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-lg bg-text1 px-4 py-2 font-sans text-[13px] font-semibold text-white"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { status } = useAuth();

  if (status === "bootstrapping") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <span className="font-sans text-docSm text-text2">Loading…</span>
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function ProtectedShellRoute() {
  const { status: authStatus } = useAuth();
  const { status, projectsError, retryProjects, isManager, isDev, isClient, hasInternalAppAccess } = useAppShell();

  if (authStatus === "bootstrapping" || status === "bootstrapping_auth" || status === "bootstrapping_projects") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <span className="font-sans text-docSm text-text2">Loading workspace…</span>
      </div>
    );
  }

  if (authStatus !== "authenticated" || status === "unauthenticated") {
    return <Navigate to="/" replace />;
  }

  if (!hasInternalAppAccess || isClient) {
    return (
      <FullScreenState
        title="Internal App Unavailable"
        message="Client users do not use the internal Orchestra shell. Open your client share link instead."
      />
    );
  }

  if (status === "fatal_error") {
    return (
      <FullScreenState
        title="Workspace Failed To Load"
        message={projectsError ?? "Unable to load your projects right now."}
        actionLabel="Retry"
        onAction={() => {
          void retryProjects();
        }}
      />
    );
  }

  if (status === "no_projects") {
    return (
      <FullScreenState
        title={isManager ? "No Projects Yet" : isDev ? "No Assigned Projects" : "No Projects"}
        message={
          isManager
            ? "Your account is ready, but there are no projects in this workspace yet."
            : "Your account is active, but you have not been assigned to any projects yet."
        }
      />
    );
  }

  return <AppShell />;
}

function PublicOnlyRoute() {
  const { status } = useAuth();

  if (status === "bootstrapping") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <span className="font-sans text-docSm text-text2">Loading…</span>
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

function ManagerDashboardRoute() {
  const { isManager, activeProjectId } = useAppShell();

  if (!isManager) {
    return activeProjectId ? <Navigate to={`/projects/${activeProjectId}/dashboard`} replace /> : <Navigate to="/settings" replace />;
  }

  return <DashboardPage />;
}

function ProjectMemoryRedirect() {
  const { projectId = "" } = useParams();
  return <Navigate to={`/projects/${projectId}/memory`} replace />;
}

function ProjectIndexRedirect() {
  const { projectId = "" } = useParams();
  return <Navigate to={`/projects/${projectId}/dashboard`} replace />;
}

function ProjectRouteGuard() {
  const { routeProjectMissing } = useAppShell();

  if (routeProjectMissing) {
    return (
      <FullScreenState
        title="Project Not Accessible"
        message="This project is not in your accessible project list or no longer exists."
      />
    );
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<ProtectedShellRoute />}>
          <Route path="/dashboard" element={<ManagerDashboardRoute />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/projects/:projectId" element={<ProjectRouteGuard />}>
            <Route index element={<ProjectIndexRedirect />} />
            <Route path="dashboard" element={<ProjectDashboardPage />} />
            <Route path="brain" element={<ProjectBrainPage />} />
            <Route path="flow" element={<ProjectFlowchartPage />} />
            <Route path="live-doc" element={<LiveDocPage />} />
            <Route path="memory" element={<ProjectMemoryPage />} />
            <Route path="docs" element={<ProjectMemoryRedirect />} />
            <Route path="docs/:docId/view" element={<LiveDocViewerPage />} />
            <Route path="requests" element={<ProjectRequestsPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
