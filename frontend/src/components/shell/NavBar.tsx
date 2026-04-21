import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileTextIcon, GitBranchIcon, Grid2x2Icon, MessageSquareIcon, SettingsIcon, SparklesIcon } from "../ui/AppIcons";

type NavBarProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

const navTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30
} as const;

const viewerByRole = {
  manager: { initials: "SC", label: "Manager" },
  dev: { initials: "MT", label: "Developer" },
  client: { initials: "LF", label: "Client" }
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

export function NavBar({ expanded, onExpandedChange }: NavBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = getCurrentRole();
  const viewer = viewerByRole[role];

  const currentProjectId = useMemo(() => {
    const matchedProject = pathname.match(/^\/projects\/([^/]+)/);
    return matchedProject?.[1] ?? "1";
  }, [pathname]);

  const items = [
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
      icon: <FileTextIcon />,
      route: `/projects/${currentProjectId}/memory`,
      active: /^\/projects\/[^/]+\/(?:memory|docs(?:\/.*)?)$/.test(pathname)
    },
    {
      key: "live-doc",
      label: "LIVE DOC",
      icon: <GitBranchIcon />,
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
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.label}
            onClick={() => navigate(item.route)}
            className={[
              "relative flex h-11 w-full items-center gap-[14px] px-[14px] text-left transition-colors",
              item.active ? "bg-[rgba(0,180,160,0.08)]" : "hover:bg-[#f7f6f3]"
            ].join(" ")}
          >
            {item.active ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[#00b4a0]" /> : null}

            <span className={item.active ? "text-[#00b4a0]" : "text-[#888888]"}>{item.icon}</span>
            <motion.span
              animate={labelAnimation(expanded)}
              className="whitespace-nowrap font-bebas text-[13px] text-[#0a0a0a]"
            >
              {item.label}
            </motion.span>
          </button>
        ))}
      </div>

      <div className="mb-4 px-[14px]">
        <div className="flex items-center">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#e0dbf5]">
            <span className="font-bebas text-[11px] leading-none text-[#8b7fd4]">{viewer.initials}</span>
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
