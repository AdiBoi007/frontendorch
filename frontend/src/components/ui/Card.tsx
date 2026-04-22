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
        y: -2,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
      }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="solid-card p-7"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="font-sans text-label font-semibold uppercase text-text2">{label}</p>
        {action}
      </div>
      {children}
    </motion.section>
  );
}
