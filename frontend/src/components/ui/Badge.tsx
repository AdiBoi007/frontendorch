type BadgeProps = {
  variant: "HEALTHY" | "AT RISK" | "CRITICAL";
};

function getTone(variant: BadgeProps["variant"]) {
  if (variant === "HEALTHY") {
    return "bg-[#e8faf7] text-[#00b4a0]";
  }

  if (variant === "AT RISK") {
    return "bg-[#fceee4] text-[#f59340]";
  }

  return "bg-[#ffe8e8] text-[#e05555]";
}

export function Badge({ variant }: BadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 font-bebas text-[11px] tracking-[0.14em] ${getTone(variant)}`}>
      {variant}
    </span>
  );
}
