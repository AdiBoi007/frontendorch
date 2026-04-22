import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/ui/Avatar";
import { ArrowRightIcon, PlusIcon } from "../components/ui/AppIcons";
import { Badge } from "../components/ui/Badge";
import { BookOpenIcon, GitBranchIcon, MessageSquareIcon, SparklesIcon } from "../components/ui/AppIcons";
import { getProjectDetail, getProjectMembers } from "../lib/api";
import { mockMeetings, mockRequests } from "../lib/mockData";
import type { ProjectDetail, ProjectMember, ProjectSubscription } from "../lib/types";

const pageVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08
    }
  }
};

const sectionVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

const avatarListVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04
    }
  }
};

const avatarVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 320,
      damping: 22
    }
  }
};

const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06
    }
  }
};

const listItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

const subscriptionGridVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05
    }
  }
};

const subscriptionCardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.32,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

const quickLaunchVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06
    }
  }
};

const quickLaunchCardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.32,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

const selectedMeetingsVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  },
  exit: {
    opacity: 0
  }
};

const selectedMeetingItemVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1] as const
    }
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: {
      duration: 0.16,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

const roleBadgeStyles = {
  manager: { background: "#e0dbf5", color: "#8b7fd4", label: "MANAGER" },
  dev: { background: "#e5e7eb", color: "#111827", label: "DEV" },
  client: { background: "#fceee4", color: "#f59340", label: "CLIENT" }
} as const;

const miniCalendarDays = ["M", "T", "W", "T", "F", "S", "S"] as const;

const todayKey = "2026-04-22";

const miniCalendarMonthGrid = Array.from({ length: 35 }, (_, index) => {
  const startDate = new Date(Date.UTC(2026, 2, 30));
  startDate.setUTCDate(startDate.getUTCDate() + index);

  return {
    key: startDate.toISOString().slice(0, 10),
    day: startDate.getUTCDate(),
    inCurrentMonth: startDate.getUTCMonth() === 3
  };
});

const meetingsByDate: Record<number, typeof mockMeetings> = {
  21: [
    { id: "1", title: "BloomFast Standup", time: "9:00 AM", duration: "15 min", type: "standup", project: "BloomFast" },
    { id: "2", title: "API Gateway Review", time: "11:30 AM", duration: "45 min", type: "review", project: "API Gateway" }
  ],
  22: [{ id: "1", title: "BloomFast Standup", time: "9:00 AM", duration: "15 min", type: "standup", project: "BloomFast" }],
  24: [{ id: "3", title: "Elara Design Review", time: "3:00 PM", duration: "30 min", type: "review", project: "Elara Games" }],
  26: [{ id: "4", title: "Sprint Planning", time: "10:00 AM", duration: "60 min", type: "meeting", project: "BloomFast" }]
};

const serviceGradients: Record<string, string> = {
  aws: "linear-gradient(135deg, #f59340, #e07020)",
  supabase: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  stripe: "linear-gradient(135deg, #8b7fd4, #6b5dc4)",
  firebase: "linear-gradient(135deg, #f59340, #e05555)",
  vercel: "linear-gradient(135deg, #0a0a0a, #333333)",
  sentry: "linear-gradient(135deg, #e05555, #c02020)"
};

const SERVICE_LOGOS: Record<string, string> = {
  "AWS (EC2 + RDS)": "https://cdn.simpleicons.org/amazonaws/FF9900",
  "Supabase Pro": "https://cdn.simpleicons.org/supabase/3ECF8E",
  Stripe: "https://cdn.simpleicons.org/stripe/635BFF",
  Firebase: "https://cdn.simpleicons.org/firebase/FFCA28",
  "Vercel Pro": "https://cdn.simpleicons.org/vercel/000000",
  Sentry: "https://cdn.simpleicons.org/sentry/362D59"
};

function getSubscriptionKey(name: string) {
  if (name.startsWith("AWS")) {
    return "aws";
  }

  if (name.startsWith("Supabase")) {
    return "supabase";
  }

  if (name.startsWith("Stripe")) {
    return "stripe";
  }

  if (name.startsWith("Firebase")) {
    return "firebase";
  }

  if (name.startsWith("Vercel")) {
    return "vercel";
  }

  if (name.startsWith("Sentry")) {
    return "sentry";
  }

  return "aws";
}

function getSubscriptionInitial(name: string) {
  const match = name.match(/[A-Z]/);
  return match?.[0] ?? name.charAt(0).toUpperCase();
}

function SubscriptionLogo({ name }: { name: string }) {
  const [hasError, setHasError] = useState(false);
  const logoUrl = SERVICE_LOGOS[name];
  const subscriptionKey = getSubscriptionKey(name);
  const showFallback = !logoUrl || hasError;

  return (
    <div
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#f5f5f2]"
      style={showFallback ? { backgroundImage: serviceGradients[subscriptionKey] } : undefined}
    >
      {showFallback ? (
        <span className="font-bebas text-[14px] leading-none text-white">{getSubscriptionInitial(name)}</span>
      ) : (
        <img
          src={logoUrl}
          alt={name}
          width={22}
          height={22}
          onError={() => setHasError(true)}
          className="h-[22px] w-[22px] object-contain"
        />
      )}
    </div>
  );
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

function formatRoleLabel(role: ProjectMember["role"]) {
  return roleBadgeStyles[role].label.charAt(0) + roleBadgeStyles[role].label.slice(1).toLowerCase();
}

function getStatusTone(status: ProjectDetail["recentChanges"][number]["status"]) {
  if (status === "accepted") {
    return {
      bar: "#111827",
      badgeClassName: "bg-[#f4f4f5] text-[#111827]"
    };
  }

  return {
    bar: "#f59340",
    badgeClassName: "bg-[#fceee4] text-[#f59340]"
  };
}

function getMeetingTypeColor(type: (typeof mockMeetings)[number]["type"]) {
  if (type === "standup") {
    return "#111827";
  }

  if (type === "review") {
    return "#f59340";
  }

  if (type === "client") {
    return "#8b7fd4";
  }

  return "#bbbbbb";
}

type TeamAvatarProps = {
  member?: ProjectMember;
  size?: number;
  openSlot?: boolean;
};

function TeamAvatar({ member, size = 36, openSlot = false }: TeamAvatarProps) {
  const [isHovered, setIsHovered] = useState(false);

  if (openSlot || !member) {
    return (
      <motion.button
        type="button"
        variants={avatarVariants}
        whileHover={{ scale: 1.15, zIndex: 10 }}
        className="flex items-center justify-center rounded-full border-2 border-dashed border-[#d0d0cc] bg-transparent font-syne text-[18px] leading-none text-[#cccccc] transition-colors hover:border-[#111827] hover:text-[#111827]"
        style={{ width: size, height: size }}
      >
        <PlusIcon className="h-[18px] w-[18px]" />
      </motion.button>
    );
  }

  return (
    <motion.div
      variants={avatarVariants}
      whileHover={{ scale: 1.15, zIndex: 10 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="relative"
    >
      <div style={{ pointerEvents: "none" }}>
        <Avatar seed={member.initials} size={size} name={member.name} role={formatRoleLabel(member.role)} />
      </div>

      <AnimatePresence>
        {isHovered ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute bottom-[110%] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#0a0a0a] px-2 py-1 font-syne text-[11px] text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
          >
            {member.name}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function AvatarStack({ members }: { members: ProjectMember[] }) {
  return (
    <motion.div initial="hidden" animate="visible" variants={avatarListVariants} className="flex items-center">
      {members.map((member, index) => (
        <motion.div key={member.initials} className={index === 0 ? "" : "-ml-[10px]"}>
          <TeamAvatar member={member} />
        </motion.div>
      ))}

      {Array.from({ length: 2 }).map((_, index) => (
        <motion.div key={`open-role-${index}`} className={members.length === 0 && index === 0 ? "" : "-ml-[10px]"}>
          <TeamAvatar openSlot />
        </motion.div>
      ))}
    </motion.div>
  );
}

function QuickLaunchCard({
  icon,
  accent,
  title,
  subtitle,
  onClick
}: {
  icon: ReactNode;
  accent: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      variants={quickLaunchCardVariants}
      whileHover={{
        y: -3,
        borderColor: accent,
        boxShadow: "0 8px 24px rgba(0,0,0,0.08), 0 16px 36px rgba(0,0,0,0.08)"
      }}
      onClick={onClick}
      className="rounded-2xl border border-transparent bg-white px-6 py-5 text-left shadow-[0_2px_8px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.06)] transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <span style={{ color: accent }}>{icon}</span>
        <span style={{ color: accent }}>
          <ArrowRightIcon className="h-5 w-5" />
        </span>
      </div>

      <p className="mt-3 font-bebas text-[16px] tracking-[0.06em] text-[#0a0a0a]">{title}</p>
      <p className="mt-1 font-syne text-[11px]" style={{ color: title === "REQUESTS" ? "#e05555" : "#888888" }}>
        {subtitle}
      </p>
    </motion.button>
  );
}

export function ProjectDashboardPage() {
  const navigate = useNavigate();
  const { id = "1" } = useParams();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [subscriptions, setSubscriptions] = useState<ProjectSubscription[]>([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionName, setSubscriptionName] = useState("");
  const [subscriptionCategory, setSubscriptionCategory] = useState("");
  const [subscriptionCost, setSubscriptionCost] = useState("");
  const [selectedDate, setSelectedDate] = useState<number>(22);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getProjectDetail(id), getProjectMembers(id)]).then(([detail, nextMembers]) => {
      if (!isMounted) {
        return;
      }

      setProject(detail);
      setMembers(nextMembers);
      setSubscriptions(detail.subscriptions);
    });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const monthlySubscriptionTotal = useMemo(
    () => subscriptions.filter((subscription) => subscription.billing === "monthly").reduce((sum, subscription) => sum + subscription.cost, 0),
    [subscriptions]
  );

  const teamBreakdown = useMemo(() => {
    const managers = members.filter((member) => member.role === "manager").length;
    const devs = members.filter((member) => member.role === "dev").length;
    const total = Math.max(members.length, 1);
    const managerPercent = Math.round((managers / total) * 100);
    const devPercent = Math.round((devs / total) * 100);
    const clientPercent = Math.max(0, 100 - managerPercent - devPercent);

    return [
      { label: "MANAGERS", color: "#8b7fd4", width: `${managerPercent}%` },
      { label: "DEVS", color: "#111827", width: `${devPercent}%` },
      { label: "CLIENTS", color: "#f59340", width: `${clientPercent}%` }
    ];
  }, [members]);

  const requestCount = mockRequests.length;
  const todaysMeetings = meetingsByDate[selectedDate] ?? [];

  function closeModal() {
    setShowSubscriptionModal(false);
    setSubscriptionName("");
    setSubscriptionCategory("");
    setSubscriptionCost("");
  }

  function handleAddSubscription() {
    if (!subscriptionName.trim() || !subscriptionCategory.trim() || !subscriptionCost.trim()) {
      return;
    }

    const cost = Number(subscriptionCost);
    if (Number.isNaN(cost)) {
      return;
    }

    setSubscriptions((currentSubscriptions) => [
      ...currentSubscriptions,
      {
        id: Date.now().toString(),
        name: subscriptionName.trim(),
        category: subscriptionCategory.trim(),
        cost,
        billing: "monthly",
        status: "active"
      }
    ]);
    closeModal();
  }

  if (!project) {
    return (
      <div className="h-full overflow-y-auto bg-[#f7f6f3] px-10 pb-10 pl-8 pt-10">
        <p className="font-syne text-[14px] text-[#888888]">Loading project…</p>
      </div>
    );
  }

  return (
    <>
      <motion.div initial="hidden" animate="visible" variants={pageVariants} className="h-full overflow-y-auto bg-[#f7f6f3] px-10 pb-10 pl-8 pt-10">
        <motion.section variants={sectionVariants} className="mb-10">
          <div className="max-w-[640px]">
            <div className="mb-2">
              <Badge variant={project.health} />
            </div>

            <h1 className="font-bebas text-[52px] leading-none text-[#0a0a0a]">{project.name}</h1>
            <p className="mt-2 max-w-[480px] font-syne text-[14px] leading-6 text-[#888888]">{project.description}</p>

            <div className="mt-3 flex flex-wrap gap-5 font-mono text-[12px] text-[#888888]">
              <span>DEADLINE: {project.deadline}</span>
              <span>SPRINT: {project.sprint}</span>
              <span>PROGRESS: {project.progress}%</span>
            </div>

            <div className="mt-5 h-1.5 max-w-[320px] overflow-hidden rounded-full bg-[#ecece7]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${project.progress}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-[#111827]"
              />
            </div>
          </div>
        </motion.section>

        <motion.section variants={sectionVariants} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="solid-card px-7 py-6">
            <div className="flex items-center">
              <p className="font-bebas text-[11px] tracking-[0.18em] text-[#999999]">TEAM</p>
              <button type="button" className="ml-auto font-syne text-[11px] text-[#111827]">
                MANAGE
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-5 min-[1700px]:flex-nowrap min-[1700px]:items-center">
              <div className="flex-shrink-0">
                <AvatarStack members={members} />
              </div>

              <div className="hidden h-8 w-px flex-shrink-0 bg-[#f0f0ec] min-[1700px]:block" />

              <div className="flex-shrink-0">
                <p className="font-bebas text-[28px] leading-none text-[#0a0a0a]">{members.length} MEMBERS</p>
                <p className="mt-1 font-syne text-[11px] leading-none text-[#888888]">CURRENT TEAM SIZE</p>
              </div>

              <div className="hidden h-8 w-px flex-shrink-0 bg-[#f0f0ec] min-[1700px]:block" />

              <div className="flex-shrink-0">
                <div className="flex h-1.5 w-[160px] overflow-hidden rounded-full">
                  {teamBreakdown.map((segment) => (
                    <span key={segment.label} style={{ width: segment.width, backgroundColor: segment.color }} />
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-3">
                  {teamBreakdown.map((segment) => (
                    <div key={segment.label} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: segment.color }} />
                      <span className="font-syne text-[10px] leading-none text-[#888888]">{segment.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hidden h-8 w-px flex-shrink-0 bg-[#f0f0ec] min-[1700px]:block" />

              <div className="flex min-w-[320px] flex-1 items-stretch">
                <div className="w-[140px] flex-shrink-0">
                  <p className="mb-[6px] font-bebas text-[12px] tracking-[0.06em] text-[#0a0a0a]">APR 2026</p>

                  <div className="mb-1 grid grid-cols-7 gap-x-[2px]">
                    {miniCalendarDays.map((day) => (
                      <span key={day} className="w-[18px] text-center font-bebas text-[9px] tracking-[0.08em] text-[#bbbbbb]">
                        {day}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-x-[2px] gap-y-[2px]">
                    {miniCalendarMonthGrid.map((item) => {
                      const isToday = item.key === todayKey;
                      const isSelected = item.inCurrentMonth && item.day === selectedDate;
                      const hasMeetings = item.inCurrentMonth && Boolean(meetingsByDate[item.day]);

                      return (
                        <div key={item.key} className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => setSelectedDate(item.day)}
                            className={[
                              "flex h-[18px] w-[18px] items-center justify-center rounded-md transition-colors",
                              isSelected
                                ? "bg-[#111827] font-bebas text-[10px] text-white"
                                : isToday
                                  ? "bg-[#0a0a0a] font-bebas text-[10px] text-white"
                                  : item.inCurrentMonth
                                    ? "cursor-pointer font-syne text-[10px] text-[#555555] hover:bg-[#f5f5f2]"
                                    : "cursor-pointer font-syne text-[10px] text-[#dddddd] hover:bg-[#f5f5f2]"
                            ].join(" ")}
                          >
                            {item.day}
                          </button>
                          <span
                            className="mt-[2px] h-[3px] w-[3px] rounded-full"
                            style={{ backgroundColor: hasMeetings ? "#111827" : "transparent" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mx-4 w-px self-stretch bg-[#f0f0ec]" />

                <div className="min-w-0 flex-1">
                  <p className="mb-[10px] font-bebas text-[10px] tracking-[0.16em] text-[#999999]">
                    {selectedDate === 22 ? "TODAY" : `APR ${selectedDate}`}
                  </p>

                  <AnimatePresence mode="wait">
                    <motion.div key={selectedDate} initial="hidden" animate="visible" exit="exit" variants={selectedMeetingsVariants} className="space-y-2">
                      {todaysMeetings.length > 0 ? (
                        <>
                          {todaysMeetings.map((meeting) => (
                            <motion.div key={meeting.id} variants={selectedMeetingItemVariants} className="flex items-center gap-2.5 rounded-xl bg-[#fafaf8] px-[10px] py-2">
                              <div className="flex w-16 flex-shrink-0 items-center gap-2">
                                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: getMeetingTypeColor(meeting.type) }} />
                                <span className="font-mono text-[12px] font-semibold text-[#0a0a0a]">{meeting.time}</span>
                              </div>
                              <p className="min-w-0 flex-1 line-clamp-1 font-syne text-[12px] font-semibold text-[#0a0a0a]">{meeting.title}</p>
                              <span className="flex-shrink-0 rounded-full border border-[#e8e8e4] bg-white px-2 py-[3px] font-mono text-[10px] text-[#888888]">
                                {meeting.duration}
                              </span>
                            </motion.div>
                          ))}

                          {todaysMeetings.length === 1 ? (
                            <motion.p variants={selectedMeetingItemVariants} className="pl-[10px] font-syne text-[11px] text-[#bbbbbb]">
                              No other meetings today
                            </motion.p>
                          ) : null}
                        </>
                      ) : (
                        <motion.p variants={selectedMeetingItemVariants} className="font-syne text-[11px] text-[#bbbbbb]">
                          No meetings today
                        </motion.p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          <div className="solid-card p-6">
            <div className="flex items-center">
              <p className="font-bebas text-[11px] tracking-[0.16em] text-[#999999]">RECENT CHANGES</p>
              <button type="button" onClick={() => navigate(`/projects/${id}/requests`)} className="ml-auto font-syne text-[11px] text-[#111827]">
                <span className="inline-flex items-center gap-1">
                  VIEW ALL
                  <ArrowRightIcon className="h-[14px] w-[14px]" />
                </span>
              </button>
            </div>

            <motion.div initial="hidden" animate="visible" variants={listVariants} className="mt-2">
              {project.recentChanges.map((change, index) => {
                const tone = getStatusTone(change.status);

                return (
                  <motion.div
                    key={change.id}
                    variants={listItemVariants}
                    className={index === project.recentChanges.length - 1 ? "py-3" : "border-b border-[#f5f5f2] py-3"}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 h-10 w-[3px] rounded-full" style={{ backgroundColor: tone.bar }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-syne text-[13px] font-semibold text-[#0a0a0a]">{change.title}</p>
                        <p className="mt-1 font-mono text-[11px] text-[#888888]">{change.timeAgo}</p>
                      </div>
                      <span className={`rounded-full px-2 py-[3px] font-bebas text-[10px] tracking-[0.12em] ${tone.badgeClassName}`}>
                        {change.status.toUpperCase()}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-5">
          <div className="solid-card p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <p className="font-bebas text-[11px] tracking-[0.16em] text-[#999999]">PROJECT SUBSCRIPTIONS</p>
              <div className="lg:ml-auto">
                <span className="inline-flex rounded-full border border-[#e8e8e4] bg-[#f5f5f2] px-3.5 py-1.5 font-mono text-[13px] font-semibold text-[#0a0a0a]">
                  {formatCurrency(monthlySubscriptionTotal)}/mo
                </span>
              </div>
            </div>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={subscriptionGridVariants}
              className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            >
              {subscriptions.map((subscription) => {
                return (
                  <motion.div
                    key={subscription.id}
                    variants={subscriptionCardVariants}
                    whileHover={{ y: -2 }}
                    className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-5 py-4 transition-colors hover:border-[#111827] hover:bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <SubscriptionLogo name={subscription.name} />

                      <p className="min-w-0 flex-1 truncate font-syne text-[13px] font-semibold text-[#0a0a0a]">{subscription.name}</p>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#111827]" />
                    </div>

                    <div className="mt-3 flex items-end gap-2">
                      <span className="font-bebas text-[10px] tracking-[0.12em] text-[#999999]">{subscription.category}</span>
                      <div className="ml-auto flex items-end gap-1">
                        {subscription.cost === 0 ? (
                          <span className="font-bebas text-[14px] leading-none text-[#888888]">USAGE</span>
                        ) : (
                          <span className="font-bebas text-[20px] leading-none text-[#0a0a0a]">{formatCurrency(subscription.cost)}</span>
                        )}
                        <span className="font-syne text-[10px] text-[#888888]">{subscription.billing === "monthly" ? "/mo" : "/txn"}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            <button
              type="button"
              onClick={() => setShowSubscriptionModal(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#d0d0cc] px-5 py-3.5 font-syne text-[13px] text-[#888888] transition-colors hover:border-[#111827] hover:bg-[rgba(17,24,39,0.04)] hover:text-[#111827]"
            >
              <PlusIcon className="h-4 w-4" />
              <span>ADD SUBSCRIPTION</span>
            </button>
          </div>
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-5">
          <motion.div initial="hidden" animate="visible" variants={quickLaunchVariants} className="grid gap-4 xl:grid-cols-4">
            <QuickLaunchCard
              icon={<SparklesIcon className="h-6 w-6" />}
              accent="#111827"
              title="BRAIN"
              subtitle="Neural knowledge map"
              onClick={() => navigate(`/projects/${id}/brain`)}
            />
            <QuickLaunchCard
              icon={<GitBranchIcon className="h-6 w-6" />}
              accent="#8b7fd4"
              title="FLOWCHART"
              subtitle="System architecture"
              onClick={() => navigate(`/projects/${id}/flow`)}
            />
            <QuickLaunchCard
              icon={<BookOpenIcon className="h-6 w-6" />}
              accent="#f59340"
              title="LIVE DOC"
              subtitle="Living PRD/SRS"
              onClick={() => navigate(`/projects/${id}/live-doc`)}
            />
            <QuickLaunchCard
              icon={<MessageSquareIcon className="h-6 w-6" />}
              accent="#e05555"
              title="REQUESTS"
              subtitle={`${requestCount} PENDING`}
              onClick={() => navigate(`/projects/${id}/requests`)}
            />
          </motion.div>
        </motion.section>
      </motion.div>

      <AnimatePresence>
        {showSubscriptionModal ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.35)] px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[420px] rounded-[24px] bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
            >
              <p className="font-bebas text-[20px] tracking-[0.06em] text-[#0a0a0a]">ADD SUBSCRIPTION</p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block font-bebas text-[10px] tracking-[0.16em] text-[#999999]">NAME</span>
                  <input
                    value={subscriptionName}
                    onChange={(event) => setSubscriptionName(event.target.value)}
                    className="w-full rounded-xl border border-[#e5e5e0] px-3.5 py-2.5 font-syne text-[13px] text-[#333333] outline-none transition-colors focus:border-[#111827]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block font-bebas text-[10px] tracking-[0.16em] text-[#999999]">CATEGORY</span>
                  <input
                    value={subscriptionCategory}
                    onChange={(event) => setSubscriptionCategory(event.target.value)}
                    className="w-full rounded-xl border border-[#e5e5e0] px-3.5 py-2.5 font-syne text-[13px] text-[#333333] outline-none transition-colors focus:border-[#111827]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block font-bebas text-[10px] tracking-[0.16em] text-[#999999]">COST / MO</span>
                  <input
                    value={subscriptionCost}
                    onChange={(event) => setSubscriptionCost(event.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-xl border border-[#e5e5e0] px-3.5 py-2.5 font-syne text-[13px] text-[#333333] outline-none transition-colors focus:border-[#111827]"
                  />
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 font-syne text-[13px] text-[#888888]">
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={handleAddSubscription}
                  className="rounded-xl bg-[#0a0a0a] px-5 py-2.5 font-bebas text-[13px] tracking-[0.08em] text-white transition-colors hover:bg-[#111827]"
                >
                  ADD
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
