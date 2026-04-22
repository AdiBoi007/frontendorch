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
    <section className="h-full overflow-y-auto bg-bg px-6 py-8 md:px-10 md:py-10">
      <div className="mb-8">
        <p className="font-sans text-label font-semibold uppercase text-text2">Settings</p>
        <h1 className="mt-2 font-sans text-[32px] font-bold leading-tight tracking-tight text-text1 md:text-[36px]">Workspace</h1>
        <p className="mt-2 font-sans text-docSm text-text2">Local mock workspace preferences for the current role.</p>
      </div>

      <div className="max-w-[540px] rounded-lg border border-border bg-white p-7 shadow-sm">
        <p className="font-sans text-label font-semibold uppercase text-text2">Active role</p>
        <p className="mt-3 font-sans text-[22px] font-semibold text-text1 md:text-2xl">{getRoleLabel()}</p>
        <p className="mt-3 font-sans text-docSm leading-6 text-textBody">
          This shell runs on local mock data only. Use the left navigation to move between dashboard, brain, docs, and requests.
        </p>
      </div>
    </section>
  );
}
