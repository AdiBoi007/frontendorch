import { motion } from "framer-motion";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { SocratesProvider } from "../../context/SocratesContext";
import { NavBar } from "./NavBar";
import { SocratesPanel } from "./SocratesPanel";

const navTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30
} as const;

export function AppShell() {
  const [navExpanded, setNavExpanded] = useState(false);

  return (
    <SocratesProvider>
      <div className="flex h-screen overflow-hidden bg-bg">
        <NavBar expanded={navExpanded} onExpandedChange={setNavExpanded} />
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ width: navExpanded ? 256 : 72 }}
          transition={navTransition}
          className="h-screen flex-shrink-0"
        />
        <SocratesPanel />
        <main className="min-w-0 flex-1 overflow-hidden bg-bg">
          <Outlet />
        </main>
      </div>
    </SocratesProvider>
  );
}
