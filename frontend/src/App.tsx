import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { LiveDocPage } from "./pages/LiveDocPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LiveDocViewerPage } from "./pages/LiveDocViewerPage";
import { ProjectBrainPage } from "./pages/ProjectBrainPage";
import { ProjectMemoryPage } from "./pages/ProjectDocsPage";
import { ProjectFlowchartPage } from "./pages/ProjectFlowchartPage";
import { ProjectRequestsPage } from "./pages/ProjectRequestsPage";
import { SettingsPage } from "./pages/SettingsPage";

function hasRole() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.localStorage.getItem("orchestra_role"));
}

function ProtectedShellRoute() {
  if (!hasRole()) {
    return <Navigate to="/" replace />;
  }

  return <AppShell />;
}

function ProjectLandingRedirect() {
  const { id = "1" } = useParams();

  return <Navigate to={`/projects/${id}/brain`} replace />;
}

function ProjectMemoryRedirect() {
  const { id = "1" } = useParams();

  return <Navigate to={`/projects/${id}/memory`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<ProtectedShellRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects/:id" element={<ProjectLandingRedirect />} />
        <Route path="/projects/:id/brain" element={<ProjectBrainPage />} />
        <Route path="/projects/:id/flow" element={<ProjectFlowchartPage />} />
        <Route path="/projects/:id/live-doc" element={<LiveDocPage />} />
        <Route path="/projects/:id/memory" element={<ProjectMemoryPage />} />
        <Route path="/projects/:id/docs" element={<ProjectMemoryRedirect />} />
        <Route path="/projects/:id/docs/:docId/view" element={<LiveDocViewerPage />} />
        <Route path="/projects/:id/requests" element={<ProjectRequestsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
