import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

const viewerByRole = {
  manager: { initials: "SC", label: "Manager", seed: "Sarah Chen" },
  dev: { initials: "MT", label: "Developer", seed: "Marcus Thompson" },
  client: { initials: "LF", label: "Client", seed: "Lisa Foster" }
} as const;

function getCurrentRole() {
  if (typeof window === "undefined") {
    return "manager";
  }

  const storedRole = window.localStorage.getItem("orchestra_role");
  if (storedRole === "dev" || storedRole === "client") {
    return storedRole;
  }

  return "manager";
}

function labelAnimation(expanded: boolean) {
  return {
    opacity: expanded ? 1 : 0,
    x: expanded ? 0 : -4,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
  };
}

function NavItemButton({ item, expanded, onClick }: { item: Extract<NavItem, { kind?: "item" }>; expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={item.label}
      onClick={onClick}
      className={[
        "relative flex h-10 w-full items-center gap-3 px-3 text-left transition-colors",
        item.active ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
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

export function NavBar({ expanded, onExpandedChange }: NavBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = getCurrentRole();
  const viewer = viewerByRole[role];

  const currentProjectId = useMemo(() => {
    const matchedProject = pathname.match(/^\/projects\/([^/]+)/);
    return matchedProject?.[1] ?? "1";
  }, [pathname]);

  const isProjectRoute = pathname.startsWith("/projects/");

  const generalItems: NavItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: <Grid2x2Icon />,
      route: "/dashboard",
      active: pathname === "/dashboard"
    },
    {
      key: "brain",
      label: "Brain",
      icon: <SparklesIcon />,
      route: `/projects/${currentProjectId}/brain`,
      active: /^\/projects\/[^/]+\/brain$/.test(pathname)
    },
    {
      key: "flow",
      label: "Flow",
      icon: <GitBranchIcon />,
      route: `/projects/${currentProjectId}/flow`,
      active: /^\/projects\/[^/]+\/flow$/.test(pathname)
    },
    {
      key: "memory",
      label: "Memory",
      icon: <BooksIcon />,
      route: `/projects/${currentProjectId}/memory`,
      active: /^\/projects\/[^/]+\/(?:memory|docs(?:\/.*)?)$/.test(pathname)
    },
    {
      key: "live-doc",
      label: "Live doc",
      icon: <FileDescriptionIcon />,
      route: `/projects/${currentProjectId}/live-doc`,
      active: /^\/projects\/[^/]+\/live-doc$/.test(pathname)
    },
    {
      key: "requests",
      label: "Requests",
      icon: <MessageSquareIcon />,
      route: `/projects/${currentProjectId}/requests`,
      active: /^\/projects\/[^/]+\/requests$/.test(pathname)
    },
    {
      key: "settings",
      label: "Settings",
      icon: <SettingsIcon />,
      route: "/settings",
      active: pathname === "/settings"
    }
  ];

  const projectItems: NavItem[] = [
    {
      key: "back",
      label: "Back",
      icon: <ArrowLeftIcon />,
      route: "/dashboard",
      active: false
    },
    { key: "project-divider", kind: "divider" },
    {
      key: "overview",
      label: "Overview",
      icon: <LayoutDashboardIcon />,
      route: `/projects/${currentProjectId}`,
      active: new RegExp(`^/projects/${currentProjectId}$`).test(pathname)
    },
    {
      key: "brain",
      label: "Brain",
      icon: <SparklesIcon />,
      route: `/projects/${currentProjectId}/brain`,
      active: new RegExp(`^/projects/${currentProjectId}/brain$`).test(pathname)
    },
    {
      key: "flowchart",
      label: "Flowchart",
      icon: <GitBranchIcon />,
      route: `/projects/${currentProjectId}/flow`,
      active: new RegExp(`^/projects/${currentProjectId}/flow$`).test(pathname)
    },
    {
      key: "memory",
      label: "Memory",
      icon: <BooksIcon />,
      route: `/projects/${currentProjectId}/memory`,
      active: new RegExp(`^/projects/${currentProjectId}/(?:memory|docs(?:/.*)?)$`).test(pathname)
    },
    {
      key: "live-doc",
      label: "Live doc",
      icon: <FileDescriptionIcon />,
      route: `/projects/${currentProjectId}/live-doc`,
      active: new RegExp(`^/projects/${currentProjectId}/live-doc$`).test(pathname)
    },
    {
      key: "requests",
      label: "Requests",
      icon: <MessageSquareIcon />,
      route: `/projects/${currentProjectId}/requests`,
      active: new RegExp(`^/projects/${currentProjectId}/requests$`).test(pathname)
    }
  ];

  const items = isProjectRoute ? projectItems : generalItems;

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 200 : 56 }}
      transition={navTransition}
      onHoverStart={() => onExpandedChange(true)}
      onHoverEnd={() => onExpandedChange(false)}
      className="fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-white/[0.08] bg-sidebar"
    >
      <div className="flex h-14 items-center px-3">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white/10">
          <span className="font-sans text-[13px] font-semibold leading-none text-white">O</span>
        </div>

        <motion.span
          animate={labelAnimation(expanded)}
          className="ml-2.5 whitespace-nowrap font-sans text-[13px] font-semibold uppercase tracking-[0.18em] text-white"
        >
          Orchestra
        </motion.span>
      </div>

      <p className="px-3 pb-2 pt-1 font-sans text-label font-semibold uppercase text-zinc-500">Workspace</p>

      <div className="flex-1 pt-1">
        {items.map((item) => {
          if (item.kind === "divider") {
            return <div key={item.key} className="mx-3 my-2 h-px bg-white/[0.08]" />;
          }

          return <NavItemButton key={item.key} item={item} expanded={expanded} onClick={() => navigate(item.route)} />;
        })}
      </div>

      <div className="mb-4 px-3">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Avatar seed={viewer.seed} size={28} name={viewer.seed} role={viewer.label} />
          </div>

          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="ml-2.5 whitespace-nowrap font-sans text-meta text-zinc-500"
              >
                {viewer.label}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
