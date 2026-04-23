import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppShell } from "../context/AppShellContext";
import { useSocrates } from "../context/SocratesContext";
import { useAuth } from "../hooks/useAuth";
import { apiGetGeneralDashboard, type GeneralDashboardPayload } from "../lib/api/dashboard";
import { ApiError } from "../lib/http";

function getTodayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects } = useAppShell();
  const { clearSelection } = useSocrates();
  const [dashboard, setDashboard] = useState<GeneralDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await apiGetGeneralDashboard();
        if (active) {
          setDashboard(payload);
        }
      } catch (nextError) {
        if (!active) {
          return;
        }
        const message = nextError instanceof ApiError ? nextError.message : "Failed to load dashboard.";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-bg px-8 py-10">
        <p className="font-sans text-docSm text-text2">Loading portfolio dashboard…</p>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="h-full overflow-y-auto bg-bg px-8 py-10">
        <div className="max-w-[560px] rounded-lg border border-border bg-white p-8 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">General dashboard</p>
          <h1 className="mt-3 font-sans text-[30px] font-bold leading-tight tracking-tight text-text1">
            Unable to load the portfolio view
          </h1>
          <p className="mt-3 font-sans text-docSm leading-6 text-textBody">
            {error ?? "The dashboard data is unavailable right now."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full overflow-y-auto bg-bg px-8 pb-10 pt-10"
    >
      <section className="mb-8">
        <p className="font-sans text-label font-semibold uppercase text-text2">Good morning</p>
        <h1 className="mt-2 font-sans text-[36px] font-bold leading-tight tracking-tight text-text1">
          {user?.displayName ?? "there"}
        </h1>
        <p className="mt-2 font-sans text-docSm text-text2">{getTodayLabel()}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Active projects</p>
          <p className="mt-3 font-sans text-[34px] font-bold text-text1">{dashboard.summary.activeProjectCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Org headcount</p>
          <p className="mt-3 font-sans text-[34px] font-bold text-text1">{dashboard.summary.orgHeadcount}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Needs review</p>
          <p className="mt-3 font-sans text-[34px] font-bold text-text1">{dashboard.summary.communication.needsReviewCount}</p>
          <p className="mt-1 font-sans text-meta text-text2">communication insights</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Open decisions</p>
          <p className="mt-3 font-sans text-[34px] font-bold text-text1">{dashboard.summary.changePressure.openDecisionCount}</p>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-sans text-label font-semibold uppercase text-text2">Accessible projects</p>
              <p className="mt-1 font-sans text-docSm text-text2">Backed by `GET /v1/projects` and dashboard snapshots.</p>
            </div>
            <p className="font-mono text-[11px] text-text2">{projects.length} loaded</p>
          </div>

          <div className="mt-5 space-y-3">
            {dashboard.projects.map((project) => (
              <button
                key={project.projectId}
                type="button"
                onClick={() => navigate(`/projects/${project.projectId}/dashboard`)}
                className="flex w-full items-start justify-between gap-4 rounded-lg border border-border bg-bg px-4 py-4 text-left transition-colors hover:border-text1"
              >
                <div className="min-w-0">
                  <p className="truncate font-sans text-[16px] font-semibold text-text1">{project.name}</p>
                  <p className="mt-1 font-sans text-docSm text-text2">
                    {project.team.headcount} members · {project.documents.totalCount} docs · {project.communication.providerCount} providers
                  </p>
                  <p className="mt-2 font-sans text-meta text-textBody">{project.attention.reasons.slice(0, 2).join(" · ") || "Healthy"}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="font-sans text-label font-semibold uppercase text-text2">{project.attention.label}</p>
                  <p className="mt-1 font-mono text-[11px] text-text2">{project.movementLabel}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Role mix</p>
          <div className="mt-4 space-y-3">
            {Object.entries(dashboard.summary.orgRoleBreakdown).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between rounded-lg bg-bg px-4 py-3">
                <p className="font-sans text-[13px] font-medium capitalize text-text1">{role}</p>
                <p className="font-mono text-[12px] text-text2">{count}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 font-sans text-label font-semibold uppercase text-text2">Brain freshness</p>
          <div className="mt-4 space-y-3">
            {Object.entries(dashboard.summary.brainFreshness).map(([state, count]) => (
              <div key={state} className="flex items-center justify-between rounded-lg bg-bg px-4 py-3">
                <p className="font-sans text-[13px] font-medium capitalize text-text1">{state}</p>
                <p className="font-mono text-[12px] text-text2">{count}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
