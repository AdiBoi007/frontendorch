import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { SocratesPanel } from "./components/shell/SocratesPanel";
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

function hasRole() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.localStorage.getItem("orchestra_role"));
}

function ProtectedRoute() {
  if (!hasRole()) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function DashboardWithSocratesRoute() {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <SocratesPanel />
      <main className="min-w-0 flex-1 overflow-hidden bg-bg">
        <DashboardPage />
      </main>
    </div>
  );
}

function ProjectMemoryRedirect() {
  const { id = "1" } = useParams();

  return <Navigate to={`/projects/${id}/memory`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardWithSocratesRoute />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/projects/:id" element={<AppShell />}>
          <Route index element={<ProjectDashboardPage />} />
          <Route path="brain" element={<ProjectBrainPage />} />
          <Route path="flow" element={<ProjectFlowchartPage />} />
          <Route path="live-doc" element={<LiveDocPage />} />
          <Route path="memory" element={<ProjectMemoryPage />} />
          <Route path="docs" element={<ProjectMemoryRedirect />} />
          <Route path="docs/:docId/view" element={<LiveDocViewerPage />} />
          <Route path="requests" element={<ProjectRequestsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
