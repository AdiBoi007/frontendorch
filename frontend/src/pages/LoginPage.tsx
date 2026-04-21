import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLoginRoles } from "../lib/api";
import type { RoleOption } from "../lib/types";

const cardTransition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as const
};

const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.12
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

function BriefcaseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path
        d="M7.5 7.5h9m-11 3h13m-12 0V8.4c0-.8.6-1.4 1.4-1.4h1.8c.2-1.7 1.5-3 3.3-3s3.1 1.3 3.3 3h1.8c.8 0 1.4.6 1.4 1.4v8.8c0 .8-.6 1.4-1.4 1.4H7.9c-.8 0-1.4-.6-1.4-1.4V10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 7a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path
        d="M8.2 8 4.5 12l3.7 4M15.8 8l3.7 4-3.7 4M13.3 5.5 10.7 18.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path
        d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const iconByRole: Record<RoleOption["icon"], JSX.Element> = {
  briefcase: <BriefcaseIcon />,
  code: <CodeIcon />,
  eye: <EyeIcon />
};

export function LoginPage() {
  const navigate = useNavigate();
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);

  useEffect(() => {
    let active = true;

    const loadRoles = async () => {
      const roles = await getLoginRoles();
      if (active) {
        setRoleOptions(roles);
      }
    };

    void loadRoles();

    return () => {
      active = false;
    };
  }, []);

  const handleRoleSelect = (role: RoleOption["key"]) => {
    localStorage.setItem("orchestra_role", role);
    navigate("/dashboard");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-10">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={cardTransition}
        className="solid-card w-full max-w-[480px] p-12"
      >
        <div className="text-center">
          <h1 className="font-bebas text-[56px] leading-none text-[#0a0a0a]">ORCHESTRA</h1>
          <p className="mt-2 font-syne text-[14px] text-[#888888]">Your product brain.</p>
        </div>

        <div className="mt-12">
          <p className="mb-4 font-bebas text-[11px] tracking-[3px] text-[#999999]">CONTINUE AS</p>

          <motion.div initial="hidden" animate="visible" variants={listVariants} className="space-y-2.5">
            {roleOptions.map((role) => (
              <motion.button
                key={role.key}
                type="button"
                variants={itemVariants}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleRoleSelect(role.key)}
                className="group flex h-[56px] w-full items-center justify-between rounded-2xl border border-[#e5e5e0] bg-white px-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors duration-200 hover:border-teal"
              >
                <span className="flex w-8 items-center justify-start text-teal">{iconByRole[role.icon]}</span>
                <span className="font-bebas text-[18px] tracking-[0.06em] text-[#0a0a0a]">{role.label}</span>
                <span className="w-8 text-right font-syne text-[18px] text-[#cccccc] transition-colors duration-200 group-hover:text-teal">
                  →
                </span>
              </motion.button>
            ))}
          </motion.div>
        </div>
      </motion.section>
    </main>
  );
}
