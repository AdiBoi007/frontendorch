import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { CalendarCard } from "../components/dashboard/CalendarCard";
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
  manager: { background: "#e0dbf5", color: "#8b7fd4", label: "Manager" },
  dev: { background: "#c8f0e8", color: "#00b4a0", label: "Dev" },
  client: { background: "#fceee4", color: "#f59340", label: "Client" }
};

const teamSplit = [
  { label: "MANAGERS 25%", color: "#8b7fd4", width: "25%" },
  { label: "DEVS 58%", color: "#00b4a0", width: "58%" },
  { label: "CLIENTS 17%", color: "#f59340", width: "17%" }
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
    return "#00b4a0";
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
        y: -3,
        boxShadow: "0 4px 14px rgba(0,0,0,0.08), 0 24px 60px rgba(0,0,0,0.1)"
      }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="solid-card px-8 py-7"
    >
      <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:gap-10">
        <div className="min-w-0 xl:w-[280px]">
          <p className="mb-3 font-bebas text-[11px] tracking-[0.16em] text-[#999999]">TEAM</p>

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
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
                  style={{ backgroundColor: style.background }}
                >
                  <span className="font-bebas text-[14px] leading-none" style={{ color: style.color }}>
                    {member.initials}
                  </span>
                </motion.div>
              );
            })}

            {Array.from({ length: 2 }).map((_, index) => (
              <button
                key={`open-slot-${index}`}
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-[#d0d0cc] bg-transparent font-syne text-[18px] leading-none text-[#cccccc] transition-colors hover:border-[#00b4a0] hover:text-[#00b4a0]"
              >
                +
              </button>
            ))}
          </motion.div>
        </div>

        <div className="hidden w-px flex-shrink-0 self-stretch bg-[linear-gradient(to_bottom,transparent,#e5e5e0_20%,#e5e5e0_80%,transparent)] xl:block" />

        <div className="flex min-w-0 flex-1 flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="font-bebas text-[40px] leading-none text-[#0a0a0a]">6</p>
              <p className="mt-1 font-syne text-[12px] text-[#888888]">ACTIVE MEMBERS</p>
            </div>

            <div>
              <p className="font-bebas text-[40px] leading-none text-[#8b7fd4]">2</p>
              <p className="mt-1 font-syne text-[12px] text-[#888888]">OPEN ROLES</p>
            </div>
          </div>

          <div>
            <div className="flex h-2 w-[200px] overflow-hidden rounded-full">
              {teamSplit.map((item) => (
                <span key={item.label} style={{ width: item.width, backgroundColor: item.color }} />
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-3">
              {teamSplit.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-syne text-[11px] text-[#888888]">{item.label}</span>
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
    <motion.div initial="hidden" animate="visible" variants={pageVariants} className="h-full overflow-y-auto bg-bg px-10 pb-10 pl-8 pt-10">
      <motion.section variants={childVariants} className="mb-10">
        <motion.header className="flex items-start justify-between gap-6">
          <div>
            <p className="font-bebas text-[12px] tracking-[3px] text-[#999999]">GOOD MORNING</p>
            <h1 className="mt-2 font-bebas text-[64px] leading-[0.95] text-[#0a0a0a]">{getViewerName()}</h1>
            <p className="mt-1 font-syne text-[14px] text-[#888888]">{getTodayLabel()}</p>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="primary-button transition-colors hover:bg-teal"
          >
            NEW PROJECT
          </motion.button>
        </motion.header>

        <div className="mt-7 border-b border-[#eeeeea]" />
      </motion.section>

      <motion.section variants={childVariants} className="mb-10">
        <p className="mb-4 font-bebas text-[11px] tracking-[0.16em] text-[#999999]">YOUR PROJECTS</p>

        <div className="grid gap-4 xl:grid-cols-3">
          {projects.map((project, index) => {
            const color = getHealthColor(project.health);

            return (
              <motion.button
                key={project.id}
                type="button"
                onClick={() => navigate(`/projects/${project.id}/brain`)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{
                  y: -4,
                  borderColor: "#00b4a0",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.08), 0 20px 40px rgba(0,0,0,0.08)"
                }}
                className="rounded-[20px] border border-transparent bg-white px-7 py-6 text-left shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_32px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                    <p className="truncate font-syne text-[16px] font-bold text-[#0a0a0a]">{project.name}</p>
                  </div>
                  <div className="ml-auto flex-shrink-0">
                    <Badge variant={project.health} />
                  </div>
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ duration: 0.9, delay: 0.2 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>

                <div className="mt-4 flex items-center">
                  <p className="font-mono text-[13px] text-[#888888]">{project.progress}%</p>
                  <span className="ml-auto font-syne text-[18px] text-[#00b4a0]">→</span>
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
        <p className="mb-4 font-bebas text-[11px] tracking-[0.16em] text-[#999999]">SCHEDULE</p>
        <CalendarCard eventsByDate={mockCalendarEvents} />
      </motion.section>
    </motion.div>
  );
}
