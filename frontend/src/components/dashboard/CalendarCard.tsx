import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { CalendarDayData, DeadlineItem, MeetingItem } from "../../lib/types";

type CalendarCardProps = {
  eventsByDate: Record<string, CalendarDayData>;
};

type CalendarCell = {
  dateKey: string;
  day: number;
  inMonth: boolean;
};

const dayHeaders = ["M", "T", "W", "T", "F", "S", "S"];
const monthLabel = "APRIL 2026";
const defaultSelectedDate = "2026-04-21";

const itemVariants = {
  hidden: { opacity: 0, x: 8 },
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.25,
      delay: index * 0.07,
      ease: [0.22, 1, 0.36, 1] as const
    }
  })
};

const ringCircumference = 169.6;

function getDeadlineColor(status: DeadlineItem["status"]) {
  if (status === "on-track") {
    return "#00b4a0";
  }

  if (status === "at-risk") {
    return "#f59340";
  }

  return "#e05555";
}

function getTypePillClasses(type: MeetingItem["type"]) {
  if (type === "standup") {
    return "text-[#00b4a0] border-[#00b4a0]";
  }

  if (type === "review") {
    return "text-[#f59340] border-[#f59340]";
  }

  if (type === "client") {
    return "text-[#8b7fd4] border-[#8b7fd4]";
  }

  return "text-[#8b7fd4] border-[#8b7fd4]";
}

function getDeadlineValue(daysLeft: number) {
  return Math.max(0, Math.min(((30 - daysLeft) / 30) * 100, 100));
}

function ScheduleColumnHeader({ label }: { label: string }) {
  return (
    <div className="mb-6">
      <p className="font-bebas text-[13px] tracking-[0.16em] text-[#0a0a0a]">{label}</p>
      <span className="mt-2 block h-0.5 w-5 bg-[#00b4a0]" />
    </div>
  );
}

function CircularRing({
  value,
  daysLeft,
  status
}: {
  value: number;
  daysLeft: number;
  status: DeadlineItem["status"];
}) {
  const color = getDeadlineColor(status);
  const strokeDashoffset = ringCircumference * (1 - value / 100);

  return (
    <div className="relative h-16 w-16">
      <svg width="64" height="64" viewBox="0 0 64 64" className="block">
        <circle cx="32" cy="32" r="27" fill="none" stroke="#f0f0ec" strokeWidth="5" />
        <motion.circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={ringCircumference}
          initial={{ strokeDashoffset: ringCircumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          transform="rotate(-90 32 32)"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pt-[1px]">
        <span className="font-bebas text-[16px] leading-none" style={{ color }}>
          {daysLeft}
        </span>
        <span className="mt-0.5 font-bebas text-[9px] leading-none text-[#999999]">D</span>
      </div>
    </div>
  );
}

function buildCalendarCells(): CalendarCell[] {
  const cells: CalendarCell[] = [];

  for (const day of [30, 31]) {
    cells.push({
      dateKey: `2026-03-${String(day).padStart(2, "0")}`,
      day,
      inMonth: false
    });
  }

  for (let day = 1; day <= 30; day += 1) {
    cells.push({
      dateKey: `2026-04-${String(day).padStart(2, "0")}`,
      day,
      inMonth: true
    });
  }

  for (const day of [1, 2, 3]) {
    cells.push({
      dateKey: `2026-05-${String(day).padStart(2, "0")}`,
      day,
      inMonth: false
    });
  }

  return cells;
}

export function CalendarCard({ eventsByDate }: CalendarCardProps) {
  const [selectedDate, setSelectedDate] = useState<string>(defaultSelectedDate);

  const calendarCells = useMemo(() => buildCalendarCells(), []);
  const selectedDay = eventsByDate[selectedDate];
  const selectedEvents = selectedDay?.meetings ?? [];
  const selectedDeadlines = selectedDay?.deadlines ?? [];
  const fallbackDeadlines = useMemo(() => {
    const deadlineMap = new Map<string, DeadlineItem>();

    Object.values(eventsByDate).forEach((day) => {
      day.deadlines.forEach((deadline) => {
        deadlineMap.set(deadline.id, deadline);
      });
    });

    return Array.from(deadlineMap.values()).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [eventsByDate]);
  const displayedDeadlines = (selectedDeadlines.length > 0 ? selectedDeadlines : fallbackDeadlines).slice(0, 3);

  return (
    <motion.section
      whileHover={{
        y: -3,
        boxShadow: "0 4px 14px rgba(0,0,0,0.08), 0 24px 60px rgba(0,0,0,0.1)"
      }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="solid-card p-8"
    >
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-5 flex items-center justify-between">
            <button type="button" className="font-syne text-[14px] text-[#888888]">
              &lt;
            </button>
            <p className="font-bebas text-[18px] tracking-[0.04em] text-[#0a0a0a]">{monthLabel}</p>
            <button type="button" className="font-syne text-[14px] text-[#888888]">
              &gt;
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {dayHeaders.map((day, index) => (
              <div key={`${day}-${index}`} className="text-center font-bebas text-[11px] tracking-[0.12em] text-[#999999]">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              const dayData = eventsByDate[cell.dateKey];
              const hasMeeting = (dayData?.meetings.length ?? 0) > 0;
              const hasDeadline = (dayData?.deadlines.length ?? 0) > 0;
              const isToday = cell.dateKey === defaultSelectedDate;
              const isSelected = selectedDate === cell.dateKey;

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => setSelectedDate(cell.dateKey)}
                  className={[
                    "relative flex h-[38px] items-center justify-center rounded-xl transition-colors",
                    isSelected ? "bg-[#00b4a0] text-white" : "",
                    !isSelected && isToday ? "bg-[#0a0a0a] text-white" : "",
                    !isSelected && !isToday ? "text-[#333333] hover:bg-[#f7f6f3]" : "",
                    !cell.inMonth ? "text-[#cccccc]" : ""
                  ].join(" ")}
                >
                  <span className="font-syne text-[13px]">{cell.day}</span>
                  {hasMeeting || hasDeadline ? (
                    <span className="absolute bottom-[5px] flex items-center gap-1">
                      {hasMeeting ? <span className="h-1 w-1 rounded-full bg-[#00b4a0]" /> : null}
                      {hasDeadline ? <span className="h-1 w-1 rounded-[1px] bg-[#f59340]" /> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:items-stretch">
          <div className="min-w-0">
            <ScheduleColumnHeader label="DEADLINES" />

            {displayedDeadlines.length === 0 ? (
              <p className="font-syne text-[14px] text-[#888888]">Nothing scheduled.</p>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${selectedDate}-deadlines-${displayedDeadlines.length}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {displayedDeadlines.map((deadline, index) => (
                    <motion.div
                      key={deadline.id}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      variants={itemVariants}
                      className="flex items-center gap-5 border-b border-[#f5f5f2] py-5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="mb-[3px] font-syne text-[11px] text-[#888888]">{deadline.project}</p>
                        <p className="font-syne text-[16px] font-bold text-[#0a0a0a]">{deadline.task}</p>
                      </div>

                      <div className="flex-shrink-0">
                        <CircularRing
                          value={getDeadlineValue(deadline.daysLeft)}
                          daysLeft={deadline.daysLeft}
                          status={deadline.status}
                        />
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          <div className="hidden w-px flex-shrink-0 self-stretch bg-[linear-gradient(to_bottom,transparent,#e5e5e0_20%,#e5e5e0_80%,transparent)] lg:block" />

          <div className="min-w-0">
            <ScheduleColumnHeader label="MEETINGS" />

            {selectedEvents.length === 0 ? (
              <p className="font-syne text-[14px] text-[#888888]">Nothing scheduled.</p>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${selectedDate}-meetings-${selectedEvents.length}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {selectedEvents.map((event, index) => (
                    <motion.div
                      key={event.id}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      variants={itemVariants}
                      className="mb-4 border-b border-[#f5f5f2] pb-4 last:mb-0 last:border-b-0 last:pb-0"
                    >
                      <p className="mb-1.5 font-mono text-[14px] font-semibold text-[#0a0a0a]">{event.time}</p>
                      <p className="font-syne text-[16px] font-bold text-[#0a0a0a]">{event.title}</p>
                      <p className="mt-1 font-syne text-[12px] text-[#888888]">{event.project}</p>

                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <span className="rounded-full border border-[#eeeeea] bg-[#f7f6f3] px-3 py-1.5 font-syne text-[11px] text-[#555555]">
                          {event.duration}
                        </span>
                        <span className={`rounded-full border px-3 py-1.5 font-syne text-[11px] ${getTypePillClasses(event.type)}`}>
                          {event.type}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
