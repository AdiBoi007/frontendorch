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
        className="solid-card w-full max-w-[440px] p-10 md:p-12"
      >
        <div className="text-center">
          <p className="font-sans text-label font-semibold uppercase text-text2">Orchestra</p>
          <h1 className="mt-3 font-sans text-[28px] font-bold leading-tight tracking-tight text-text1">Sign in</h1>
          <p className="mt-2 font-sans text-docSm text-text2">Your product brain.</p>
        </div>

        <div className="mt-10">
          <p className="mb-3 font-sans text-label font-semibold uppercase text-text2">Continue as</p>

          <motion.div initial="hidden" animate="visible" variants={listVariants} className="space-y-2">
            {roleOptions.map((role) => (
              <motion.button
                key={role.key}
                type="button"
                variants={itemVariants}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                onClick={() => handleRoleSelect(role.key)}
                className="group flex h-[52px] w-full items-center justify-between rounded-lg border border-border bg-white px-4 transition-colors duration-200 hover:border-text1"
              >
                <span className="flex w-8 items-center justify-start text-text2 group-hover:text-text1">{iconByRole[role.icon]}</span>
                <span className="font-sans text-[15px] font-semibold text-text1">{role.label}</span>
                <span className="flex w-8 justify-end text-text3 transition-colors duration-200 group-hover:text-text1">
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
