function getRoleLabel() {
  if (typeof window === "undefined") {
    return "Manager";
  }

  const role = window.localStorage.getItem("orchestra_role");

  if (role === "dev") {
    return "Developer";
  }

  if (role === "client") {
    return "Client";
  }

  return "Manager";
}

export function SettingsPage() {
  return (
    <section className="h-full overflow-y-auto bg-bg px-8 py-10">
      <div className="mb-8">
        <p className="font-bebas text-[12px] tracking-[0.18em] text-[#00b4a0]">SETTINGS</p>
        <h1 className="mt-2 font-bebas text-[48px] leading-none text-[#0a0a0a]">WORKSPACE</h1>
        <p className="mt-2 font-syne text-[14px] text-[#888888]">Local mock workspace preferences for the current role.</p>
      </div>

      <div className="max-w-[540px] rounded-[24px] border border-[#ecece7] bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.05)]">
        <p className="font-bebas text-[13px] tracking-[0.16em] text-[#00b4a0]">ACTIVE ROLE</p>
        <p className="mt-3 font-syne text-[24px] font-bold text-[#0a0a0a]">{getRoleLabel()}</p>
        <p className="mt-3 font-syne text-[14px] leading-6 text-[#666666]">
          This shell runs on local mock data only. Use the left navigation to move between dashboard, brain, docs, and requests.
        </p>
      </div>
    </section>
  );
}
