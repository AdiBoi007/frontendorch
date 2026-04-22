import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { CalendarCard } from "../components/dashboard/CalendarCard";
import Avatar from "../components/ui/Avatar";
import { ArrowRightIcon, PlusIcon } from "../components/ui/AppIcons";
import { Badge } from "../components/ui/Badge";
import { mockCalendarEvents, mockProjects } from "../lib/mockData";
import type { ProjectCardItem } from "../lib/types";

const pageVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const childVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

type TeamRole = "manager" | "dev" | "client";

const teamMembers = [
  { initials: "SC", role: "manager", name: "Sarah Chen" },
  { initials: "MT", role: "dev", name: "Marcus T" },
  { initials: "PK", role: "dev", name: "Priya K" },
  { initials: "JW", role: "dev", name: "James W" },
  { initials: "AP", role: "dev", name: "Alex P" },
  { initials: "LF", role: "client", name: "Lisa F" }
] as const satisfies ReadonlyArray<{ initials: string; role: TeamRole; name: string }>;

const teamRoleStyles: Record<TeamRole, { background: string; color: string; label: string }> = {
  manager: { background: "#eef2ff", color: "#4338ca", label: "Manager" },
  dev: { background: "#f3f4f6", color: "#374151", label: "Dev" },
  client: { background: "#fef3c7", color: "#92400e", label: "Client" }
};

const teamSplit = [
  { label: "Managers 25%", color: "#6366f1", width: "25%" },
  { label: "Devs 58%", color: "#374151", width: "58%" },
  { label: "Clients 17%", color: "#d97706", width: "17%" }
] as const;

const avatarListVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05
    }
  }
};

const avatarItemVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

function getViewerName() {
  if (typeof window === "undefined") {
    return "MANAGER";
  }

  return (window.localStorage.getItem("orchestra_role") ?? "manager").toUpperCase();
}

function getTodayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function getHealthColor(health: ProjectCardItem["health"]) {
  if (health === "HEALTHY") {
    return "#374151";
  }

  if (health === "AT RISK") {
    return "#f59340";
  }

  return "#e05555";
}

function TeamHeadcountCard() {
  return (
    <motion.section
      whileHover={{
        y: -2,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
      }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="solid-card px-8 py-7"
    >
      <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:gap-10">
        <div className="min-w-0 xl:w-[280px]">
          <p className="mb-3 font-sans text-label font-semibold uppercase text-text2">Team</p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={avatarListVariants}
            className="flex max-w-[280px] flex-wrap gap-2.5"
          >
            {teamMembers.map((member) => {
              const style = teamRoleStyles[member.role];

              return (
                <motion.div
                  key={member.initials}
                  variants={avatarItemVariants}
                  whileHover={{ scale: 1.15, zIndex: 10 }}
                  title={`${member.name} · ${style.label}`}
                  className="relative"
                >
                  <Avatar seed={member.initials} name={member.name} role={style.label} />
                </motion.div>
              );
            })}

            {Array.from({ length: 2 }).map((_, index) => (
              <button
                key={`open-slot-${index}`}
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-border bg-transparent font-sans text-[18px] leading-none text-text3 transition-colors hover:border-text1 hover:text-text1"
              >
                <PlusIcon className="h-[18px] w-[18px]" />
              </button>
            ))}
          </motion.div>
        </div>

        <div className="hidden w-px flex-shrink-0 self-stretch bg-[linear-gradient(to_bottom,transparent,var(--border)_20%,var(--border)_80%,transparent)] xl:block" />

        <div className="flex min-w-0 flex-1 flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="font-sans text-[32px] font-bold leading-none tracking-tight text-text1">6</p>
              <p className="mt-1 font-sans text-meta text-text2">Active members</p>
            </div>

            <div>
              <p className="font-sans text-[32px] font-bold leading-none tracking-tight text-indigo-600">2</p>
              <p className="mt-1 font-sans text-meta text-text2">Open roles</p>
            </div>
          </div>

          <div className="lg:ml-2">
            <div className="flex h-2 w-[200px] overflow-hidden rounded-full">
              {teamSplit.map((item) => (
                <span key={item.label} style={{ width: item.width, backgroundColor: item.color }} />
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-3">
              {teamSplit.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-sans text-[11px] text-text2">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const projects = mockProjects;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      className="h-full overflow-y-auto bg-bg px-10 pb-10 pl-8 pt-10"
    >
      <motion.section variants={childVariants} className="mb-10">
        <motion.header className="flex items-start justify-between gap-6">
          <div>
            <p className="font-sans text-label font-semibold uppercase text-text2">Good morning</p>
            <h1 className="mt-2 font-sans text-[36px] font-bold leading-tight tracking-tight text-text1 md:text-[40px]">
              {getViewerName()}
            </h1>
            <p className="mt-2 font-sans text-docSm text-text2">{getTodayLabel()}</p>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="primary-button transition-opacity hover:opacity-90"
          >
            NEW PROJECT
          </motion.button>
        </motion.header>

        <div className="mt-7 border-b border-border" />
      </motion.section>

      <motion.section variants={childVariants} className="mb-10">
        <p className="mb-4 font-sans text-label font-semibold uppercase text-text2">Your projects</p>

        <div className="grid gap-4 xl:grid-cols-3">
          {projects.map((project, index) => {
            const color = getHealthColor(project.health);

            return (
              <motion.button
                key={project.id}
                type="button"
                onClick={() => navigate(`/projects/${project.id}`)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{
                  y: -2,
                  borderColor: "#d1d5db",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
                }}
                className="rounded-lg border border-transparent bg-white px-7 py-6 text-left shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                    <p className="truncate font-sans text-[16px] font-semibold text-text1">{project.name}</p>
                  </div>
                  <div className="ml-auto flex-shrink-0">
                    <Badge variant={project.health} />
                  </div>
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ duration: 0.9, delay: 0.2 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>

                <div className="mt-4 flex items-center">
                  <p className="font-mono text-meta text-text2">{project.progress}%</p>
                  <span className="ml-auto text-text1">
                    <ArrowRightIcon className="h-[18px] w-[18px]" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      <motion.div variants={childVariants} className="mb-10">
        <TeamHeadcountCard />
      </motion.div>

      <motion.section variants={childVariants}>
        <p className="mb-4 font-sans text-label font-semibold uppercase text-text2">Schedule</p>
        <CalendarCard eventsByDate={mockCalendarEvents} />
      </motion.section>
    </motion.div>
  );
}
