import { motion } from "framer-motion";
import type { ReactNode } from "react";

type CardProps = {
  label: string;
  action?: ReactNode;
  children: ReactNode;
};

export function Card({ label, action, children }: CardProps) {
  return (
    <motion.section
      whileHover={{
        y: -3,
        boxShadow: "0 4px 14px rgba(0,0,0,0.08), 0 24px 60px rgba(0,0,0,0.1)"
      }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="solid-card p-7"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="font-bebas text-[11px] tracking-[3px] text-[#999999]">{label}</p>
        {action}
      </div>
      {children}
    </motion.section>
  );
}
