type BadgeProps = {
  variant: "HEALTHY" | "AT RISK" | "CRITICAL";
};

function getTone(variant: BadgeProps["variant"]) {
  if (variant === "HEALTHY") {
    return "bg-zinc-100 text-zinc-700";
  }

  if (variant === "AT RISK") {
    return "bg-[#fceee4] text-[#f59340]";
  }

  return "bg-[#ffe8e8] text-[#e05555]";
}

export function Badge({ variant }: BadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] ${getTone(variant)}`}>
      {variant}
    </span>
  );
}
