import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppShell } from "../../context/AppShellContext";
import { useAuth } from "../../hooks/useAuth";
import Avatar from "../ui/Avatar";
import {
  ArrowLeftIcon,
  BooksIcon,
  FileDescriptionIcon,
  GitBranchIcon,
  Grid2x2Icon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  SettingsIcon,
  SparklesIcon
} from "../ui/AppIcons";

type NavBarProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

type NavItem =
  | {
      key: string;
      kind?: "item";
      label: string;
      icon: ReactNode;
      route: string;
      active: boolean;
      disabled?: boolean;
    }
  | {
      key: string;
      kind: "divider";
    };

const navTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30
} as const;

function labelAnimation(expanded: boolean) {
  return {
    opacity: expanded ? 1 : 0,
    x: expanded ? 0 : -4,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
  };
}

function NavItemButton({
  item,
  expanded,
  onClick
}: {
  item: Extract<NavItem, { kind?: "item" }>;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={item.label}
      disabled={item.disabled}
      onClick={onClick}
      className={[
        "relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors",
        item.active ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
        item.disabled ? "cursor-not-allowed opacity-50" : ""
      ].join(" ")}
    >
      <span className={item.active ? "text-white" : "text-zinc-500"}>{item.icon}</span>
      <motion.span
        animate={labelAnimation(expanded)}
        className={[
          "whitespace-nowrap font-sans text-[12px] font-medium uppercase tracking-[0.14em]",
          item.active ? "text-white" : "text-zinc-400"
        ].join(" ")}
      >
        {item.label}
      </motion.span>
    </button>
  );
}

function ProjectSwitcher({ expanded }: { expanded: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { projects, activeProjectId, selectProject, isManager } = useAppShell();

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="px-3">
      <motion.p animate={labelAnimation(expanded)} className="mb-2 font-sans text-label font-semibold uppercase text-zinc-500">
        Projects
      </motion.p>

      <div className="space-y-1">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                selectProject(project.id);
                if (!pathname.startsWith("/projects/")) {
                  navigate(`/projects/${project.id}/dashboard`);
                }
              }}
              className={[
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                isActive ? "border-white/[0.16] bg-white/[0.08]" : "border-transparent bg-white/[0.02] hover:bg-white/[0.05]"
              ].join(" ")}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    project.status === "active" ? "#6ee7b7" : project.status === "paused" ? "#fbbf24" : "#a1a1aa"
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[12px] font-semibold text-white">{project.name}</p>
                <motion.p animate={labelAnimation(expanded)} className="truncate font-mono text-[10px] uppercase text-zinc-500">
                  {project.status} {isManager ? `· ${project.members.length} members` : ""}
                </motion.p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NavBar({ expanded, onExpandedChange }: NavBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { activeProjectId, isManager } = useAppShell();

  const roleLabel =
    user?.workspaceRoleDefault === "dev"
      ? "Developer"
      : user?.workspaceRoleDefault === "client"
        ? "Client"
        : "Manager";

  const projectDashboardPath = activeProjectId ? `/projects/${activeProjectId}/dashboard` : "/settings";
  const projectScopedPath = (suffix: string) => (activeProjectId ? `/projects/${activeProjectId}/${suffix}` : "/settings");

  const items: NavItem[] = useMemo(() => {
    const nextItems: NavItem[] = [];

    if (pathname.startsWith("/projects/")) {
      nextItems.push({
        key: "back",
        label: "Back",
        icon: <ArrowLeftIcon />,
        route: isManager ? "/dashboard" : projectDashboardPath,
        active: false
      });
      nextItems.push({ key: "divider-top", kind: "divider" });
    }

    if (isManager) {
      nextItems.push({
        key: "dashboard-general",
        label: "Dashboard",
        icon: <Grid2x2Icon />,
        route: "/dashboard",
        active: pathname === "/dashboard"
      });
    }

    nextItems.push(
      {
        key: "dashboard-project",
        label: "Project",
        icon: <LayoutDashboardIcon />,
        route: projectDashboardPath,
        active: /^\/projects\/[^/]+\/dashboard$/.test(pathname),
        disabled: !activeProjectId
      },
      {
        key: "brain",
        label: "Brain",
        icon: <SparklesIcon />,
        route: projectScopedPath("brain"),
        active: /^\/projects\/[^/]+\/brain$/.test(pathname),
        disabled: !activeProjectId
      },
      {
        key: "graph",
        label: "Graph",
        icon: <GitBranchIcon />,
        route: projectScopedPath("flow"),
        active: /^\/projects\/[^/]+\/flow$/.test(pathname),
        disabled: !activeProjectId
      },
      {
        key: "memory",
        label: "Docs",
        icon: <BooksIcon />,
        route: projectScopedPath("memory"),
        active: /^\/projects\/[^/]+\/(?:memory|docs(?:\/.*)?)$/.test(pathname),
        disabled: !activeProjectId
      },
      {
        key: "live-doc",
        label: "Live doc",
        icon: <FileDescriptionIcon />,
        route: projectScopedPath("live-doc"),
        active: /^\/projects\/[^/]+\/live-doc$/.test(pathname),
        disabled: !activeProjectId
      },
      {
        key: "requests",
        label: "Requests",
        icon: <MessageSquareIcon />,
        route: projectScopedPath("requests"),
        active: /^\/projects\/[^/]+\/requests$/.test(pathname),
        disabled: !activeProjectId
      },
      { key: "divider-bottom", kind: "divider" },
      {
        key: "settings",
        label: "Settings",
        icon: <SettingsIcon />,
        route: "/settings",
        active: pathname === "/settings"
      }
    );

    return nextItems;
  }, [activeProjectId, isManager, pathname, projectDashboardPath]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 256 : 72 }}
      transition={navTransition}
      onHoverStart={() => onExpandedChange(true)}
      onHoverEnd={() => onExpandedChange(false)}
      className="fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-white/[0.08] bg-sidebar px-2"
    >
      <div className="flex h-14 items-center px-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-white/10">
          <span className="font-sans text-[13px] font-semibold leading-none text-white">O</span>
        </div>

        <motion.span
          animate={labelAnimation(expanded)}
          className="ml-2.5 whitespace-nowrap font-sans text-[13px] font-semibold uppercase tracking-[0.18em] text-white"
        >
          Orchestra
        </motion.span>
      </div>

      <div className="pb-3 pt-1">
        <ProjectSwitcher expanded={expanded} />
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-4">
        {items.map((item) => {
          if (item.kind === "divider") {
            return <div key={item.key} className="mx-3 my-2 h-px bg-white/[0.08]" />;
          }

          return (
            <NavItemButton key={item.key} item={item} expanded={expanded} onClick={() => navigate(item.route)} />
          );
        })}
      </div>

      <div className="mb-4 px-3">
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0">
            <Avatar seed={user?.displayName ?? ""} size={30} name={user?.displayName ?? ""} role={roleLabel} />
          </div>

          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-w-0 flex-col"
              >
                <span className="truncate whitespace-nowrap font-sans text-[11px] font-medium text-zinc-300">
                  {user?.displayName ?? ""}
                </span>
                <span className="font-sans text-[10px] text-zinc-500">{roleLabel}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="mt-1 text-left font-sans text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  Sign out
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
