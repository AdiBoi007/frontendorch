import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightIcon, CodeIcon, EyeIcon, UserIcon } from "../components/ui/AppIcons";
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

const iconByRole: Record<RoleOption["icon"], JSX.Element> = {
  briefcase: <UserIcon className="h-[18px] w-[18px]" />,
  code: <CodeIcon className="h-[18px] w-[18px]" />,
  eye: <EyeIcon className="h-[18px] w-[18px]" />
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
                <span className="flex w-8 justify-end text-[#cccccc] transition-colors duration-200 group-hover:text-teal">
                  <ArrowRightIcon className="h-[18px] w-[18px]" />
                </span>
              </motion.button>
            ))}
          </motion.div>
        </div>
      </motion.section>
    </main>
  );
}
