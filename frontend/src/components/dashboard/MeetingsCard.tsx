import { motion } from "framer-motion";
import type { MeetingItem } from "../../lib/types";
import { Card } from "../ui/Card";

type MeetingsCardProps = {
  meetings: MeetingItem[];
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

function getMeetingDot(type: MeetingItem["type"]) {
  if (type === "standup") {
    return "#00b4a0";
  }

  if (type === "review") {
    return "#f59340";
  }

  return "#8b7fd4";
}

function getTodayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

export function MeetingsCard({ meetings }: MeetingsCardProps) {
  return (
    <Card label="TODAY" action={<span className="font-mono text-[12px] text-[#888888]">{getTodayLabel()}</span>}>
      {meetings.length === 0 ? (
        <p className="py-4 font-syne text-[14px] text-[#888888]">Nothing scheduled.</p>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={listVariants}>
          {meetings.map((item) => (
            <motion.div
              key={item.id}
              variants={itemVariants}
              className="flex items-center gap-4 border-b border-[#f0f0ec] py-[14px] last:border-b-0 last:pb-0 first:pt-0"
            >
              <p className="w-20 flex-shrink-0 font-mono text-[14px] font-medium text-[#0a0a0a]">{item.time}</p>

              <div className="min-w-0 flex-1">
                <p className="font-syne text-[15px] font-semibold text-[#0a0a0a]">{item.title}</p>
                <p className="mt-0.5 font-syne text-[12px] text-[#888888]">{item.project}</p>
              </div>

              <span className="rounded-full border border-[#eeeeea] bg-[#f7f6f3] px-3 py-1 font-syne text-[12px] text-[#555555]">
                {item.duration}
              </span>
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: getMeetingDot(item.type) }} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </Card>
  );
}
