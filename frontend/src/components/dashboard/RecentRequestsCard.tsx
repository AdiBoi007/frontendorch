import { motion } from "framer-motion";
import type { RequestItem } from "../../lib/types";
import { Card } from "../ui/Card";

type RecentRequestsCardProps = {
  requests: RequestItem[];
};

const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

function getPlatformTone(platform: RequestItem["platform"]) {
  if (platform === "slack") {
    return { background: "#4A154B", label: "S" };
  }

  if (platform === "email") {
    return { background: "#1a73e8", label: "G" };
  }

  return { background: "#25D366", label: "W" };
}

function getStatusTone(status: RequestItem["status"]) {
  if (status === "pending") {
    return "border-[#f59340] bg-[#fceee4] text-[#f59340]";
  }

  return "border-[#00b4a0] bg-[#e8faf7] text-[#00b4a0]";
}

export function RecentRequestsCard({ requests }: RecentRequestsCardProps) {
  const pendingCount = requests.filter((item) => item.status === "pending").length;

  return (
    <Card
      label="RECENT REQUESTS"
      action={
        <span className="rounded-full bg-[#fceee4] px-3 py-1 font-bebas text-[11px] tracking-[0.14em] text-[#f59340]">
          {pendingCount} PENDING
        </span>
      }
    >
      <motion.div initial="hidden" animate="visible" variants={listVariants}>
        {requests.map((item) => {
          const platformTone = getPlatformTone(item.platform);

          return (
            <motion.div
              key={item.id}
              variants={itemVariants}
              className="flex items-start gap-4 border-b border-[#f0f0ec] py-4 last:border-b-0 last:pb-0 first:pt-0"
            >
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-bebas text-[14px] text-white"
                style={{ backgroundColor: platformTone.background }}
              >
                {platformTone.label}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-syne text-[12px] text-[#888888]">{item.from}</p>
                <p className="mt-0.5 line-clamp-2 font-syne text-[14px] font-medium text-[#0a0a0a]">{item.message}</p>
              </div>

              <div className="w-[94px] flex-shrink-0 text-right">
                <p className="font-mono text-[11px] text-[#888888]">{item.time}</p>
                <span
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 font-bebas text-[10px] tracking-[0.14em] ${getStatusTone(item.status)}`}
                >
                  {item.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </Card>
  );
}
