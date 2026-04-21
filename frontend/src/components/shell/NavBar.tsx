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
        "relative flex h-11 w-full items-center gap-[14px] px-[14px] text-left transition-colors",
        item.active ? "bg-[rgba(0,180,160,0.08)]" : "hover:bg-[#f7f6f3]"
      ].join(" ")}
    >
      {item.active ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[#00b4a0]" /> : null}

      <span className={item.active ? "text-[#00b4a0]" : "text-[#888888]"}>{item.icon}</span>
      <motion.span animate={labelAnimation(expanded)} className="whitespace-nowrap font-bebas text-[13px] text-[#0a0a0a]">
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
      label: "DASHBOARD",
      icon: <Grid2x2Icon />,
      route: "/dashboard",
      active: pathname === "/dashboard"
    },
    {
      key: "brain",
      label: "BRAIN",
      icon: <SparklesIcon />,
      route: `/projects/${currentProjectId}/brain`,
      active: /^\/projects\/[^/]+\/brain$/.test(pathname)
    },
    {
      key: "flow",
      label: "FLOW",
      icon: <GitBranchIcon />,
      route: `/projects/${currentProjectId}/flow`,
      active: /^\/projects\/[^/]+\/flow$/.test(pathname)
    },
    {
      key: "memory",
      label: "MEMORY",
      icon: <BooksIcon />,
      route: `/projects/${currentProjectId}/memory`,
      active: /^\/projects\/[^/]+\/(?:memory|docs(?:\/.*)?)$/.test(pathname)
    },
    {
      key: "live-doc",
      label: "LIVE DOC",
      icon: <FileDescriptionIcon />,
      route: `/projects/${currentProjectId}/live-doc`,
      active: /^\/projects\/[^/]+\/live-doc$/.test(pathname)
    },
    {
      key: "requests",
      label: "REQUESTS",
      icon: <MessageSquareIcon />,
      route: `/projects/${currentProjectId}/requests`,
      active: /^\/projects\/[^/]+\/requests$/.test(pathname)
    },
    {
      key: "settings",
      label: "SETTINGS",
      icon: <SettingsIcon />,
      route: "/settings",
      active: pathname === "/settings"
    }
  ];

  const projectItems: NavItem[] = [
    {
      key: "back",
      label: "BACK",
      icon: <ArrowLeftIcon />,
      route: "/dashboard",
      active: false
    },
    { key: "project-divider", kind: "divider" },
    {
      key: "overview",
      label: "OVERVIEW",
      icon: <LayoutDashboardIcon />,
      route: `/projects/${currentProjectId}`,
      active: new RegExp(`^/projects/${currentProjectId}$`).test(pathname)
    },
    {
      key: "brain",
      label: "BRAIN",
      icon: <SparklesIcon />,
      route: `/projects/${currentProjectId}/brain`,
      active: new RegExp(`^/projects/${currentProjectId}/brain$`).test(pathname)
    },
    {
      key: "flowchart",
      label: "FLOWCHART",
      icon: <GitBranchIcon />,
      route: `/projects/${currentProjectId}/flow`,
      active: new RegExp(`^/projects/${currentProjectId}/flow$`).test(pathname)
    },
    {
      key: "memory",
      label: "MEMORY",
      icon: <BooksIcon />,
      route: `/projects/${currentProjectId}/memory`,
      active: new RegExp(`^/projects/${currentProjectId}/(?:memory|docs(?:/.*)?)$`).test(pathname)
    },
    {
      key: "live-doc",
      label: "LIVE DOC",
      icon: <FileDescriptionIcon />,
      route: `/projects/${currentProjectId}/live-doc`,
      active: new RegExp(`^/projects/${currentProjectId}/live-doc$`).test(pathname)
    },
    {
      key: "requests",
      label: "REQUESTS",
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
      className="fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-[#eeeeea] bg-white shadow-[4px_0_16px_rgba(0,0,0,0.04)]"
    >
      <div className="flex h-16 items-center px-[14px]">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#00b4a0]">
          <span className="font-bebas text-[16px] leading-none text-white">O</span>
        </div>

        <motion.span animate={labelAnimation(expanded)} className="ml-[10px] whitespace-nowrap font-bebas text-[15px] text-[#0a0a0a]">
          ORCHESTRA
        </motion.span>
      </div>

      <div className="flex-1 pt-2">
        {items.map((item) => {
          if (item.kind === "divider") {
            return <div key={item.key} className="mx-[22px] my-2 h-px bg-[#e8e8e4]" />;
          }

          return <NavItemButton key={item.key} item={item} expanded={expanded} onClick={() => navigate(item.route)} />;
        })}
      </div>

      <div className="mb-4 px-[14px]">
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
                className="ml-[10px] whitespace-nowrap font-syne text-[11px] text-[#888888]"
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
