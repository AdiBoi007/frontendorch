import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppShell } from "../context/AppShellContext";
import { useSocrates } from "../context/SocratesContext";
import { apiGetProjectDashboard, type ProjectDashboardPayload } from "../lib/api/dashboard";
import { ApiError } from "../lib/http";

export function ProjectDashboardPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { projectDetail, projectMembers, projectDataLoading } = useAppShell();
  const { setSelection } = useSocrates();
  const [dashboard, setDashboard] = useState<ProjectDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    setSelection({
      selectedRefType: "dashboard_scope",
      selectedRefId: projectId,
      viewerState: null,
    });
  }, [projectId, setSelection]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await apiGetProjectDashboard(projectId);
        if (active) {
          setDashboard(payload);
        }
      } catch (nextError) {
        if (!active) {
          return;
        }
        const message = nextError instanceof ApiError ? nextError.message : "Failed to load project dashboard.";
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
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="h-full overflow-y-auto bg-bg px-8 py-10">
        <p className="font-sans text-docSm text-text2">Project route is missing a project id.</p>
      </div>
    );
  }

  if (loading || projectDataLoading) {
    return (
      <div className="h-full overflow-y-auto bg-bg px-8 py-10">
        <p className="font-sans text-docSm text-text2">Loading project workspace…</p>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="h-full overflow-y-auto bg-bg px-8 py-10">
        <div className="max-w-[560px] rounded-lg border border-border bg-white p-8 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Project dashboard</p>
          <h1 className="mt-3 font-sans text-[30px] font-bold leading-tight tracking-tight text-text1">
            Unable to load project
          </h1>
          <p className="mt-3 font-sans text-docSm leading-6 text-textBody">
            {error ?? "The project dashboard is unavailable right now."}
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
        <p className="font-sans text-label font-semibold uppercase text-text2">Project dashboard</p>
        <h1 className="mt-2 font-sans text-[36px] font-bold leading-tight tracking-tight text-text1">
          {projectDetail?.name ?? dashboard.project.name}
        </h1>
        <p className="mt-2 max-w-[720px] font-sans text-docSm text-text2">
          {projectDetail?.description ?? dashboard.project.description ?? "Current truth, readiness, and workload for this project."}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Members</p>
          <p className="mt-3 font-sans text-[34px] font-bold text-text1">{dashboard.teamSummary.headcount}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Documents</p>
          <p className="mt-3 font-sans text-[34px] font-bold text-text1">{dashboard.documents.totalCount}</p>
          <p className="mt-1 font-sans text-meta text-text2">{dashboard.documents.readinessState}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Brain freshness</p>
          <p className="mt-3 font-sans text-[34px] font-bold capitalize text-text1">{dashboard.brain.freshnessState}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Needs review</p>
          <p className="mt-3 font-sans text-[34px] font-bold text-text1">{dashboard.communication.needsReviewCount}</p>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-sans text-label font-semibold uppercase text-text2">Team</p>
              <p className="mt-1 font-sans text-docSm text-text2">Loaded from `GET /v1/projects/:projectId/members` and dashboard snapshots.</p>
            </div>
            <p className="font-mono text-[11px] text-text2">
              {projectMembers?.summary.headcount ?? dashboard.teamSummary.headcount} members
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {dashboard.teamSummary.members.map((member) => (
              <div key={member.membershipId} className="flex items-center justify-between rounded-lg border border-border bg-bg px-4 py-3">
                <div>
                  <p className="font-sans text-[14px] font-semibold text-text1">{member.displayName}</p>
                  <p className="font-sans text-meta text-text2">
                    {member.projectRole} {member.roleInProject ? `· ${member.roleInProject}` : ""}
                  </p>
                </div>
                <p className="font-mono text-[11px] uppercase text-text2">
                  {member.workloadLabel}
                  {member.allocationPercent !== null ? ` · ${member.allocationPercent}%` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
            <p className="font-sans text-label font-semibold uppercase text-text2">Attention</p>
            <p className="mt-3 font-sans text-[28px] font-bold capitalize text-text1">{dashboard.attention.label}</p>
            <div className="mt-4 space-y-2">
              {dashboard.attention.reasons.length > 0 ? (
                dashboard.attention.reasons.map((reason) => (
                  <div key={reason} className="rounded-lg bg-bg px-4 py-3 font-sans text-docSm text-textBody">
                    {reason}
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-bg px-4 py-3 font-sans text-docSm text-textBody">No immediate project pressure.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
            <p className="font-sans text-label font-semibold uppercase text-text2">Quick launch</p>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/brain`)}
                className="rounded-lg border border-border bg-bg px-4 py-3 text-left font-sans text-[13px] font-semibold text-text1"
              >
                Product Brain
              </button>
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/live-doc`)}
                className="rounded-lg border border-border bg-bg px-4 py-3 text-left font-sans text-[13px] font-semibold text-text1"
              >
                Live Doc
              </button>
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/memory`)}
                className="rounded-lg border border-border bg-bg px-4 py-3 text-left font-sans text-[13px] font-semibold text-text1"
              >
                Documents
              </button>
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/requests`)}
                className="rounded-lg border border-border bg-bg px-4 py-3 text-left font-sans text-[13px] font-semibold text-text1"
              >
                Requests
              </button>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
