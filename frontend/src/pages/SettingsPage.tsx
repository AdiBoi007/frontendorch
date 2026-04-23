import { useAuth } from "../hooks/useAuth";

export function SettingsPage() {
  const { user } = useAuth();

  const roleLabel =
    user?.workspaceRoleDefault === "dev"
      ? "Developer"
      : user?.workspaceRoleDefault === "client"
        ? "Client"
        : "Manager";

  return (
    <section className="h-full overflow-y-auto bg-bg px-6 py-8 md:px-10 md:py-10">
      <div className="mb-8">
        <p className="font-sans text-label font-semibold uppercase text-text2">Settings</p>
        <h1 className="mt-2 font-sans text-[32px] font-bold leading-tight tracking-tight text-text1 md:text-[36px]">
          Workspace
        </h1>
        <p className="mt-2 font-sans text-docSm text-text2">
          Account and workspace preferences.
        </p>
      </div>

      <div className="max-w-[540px] space-y-4">
        <div className="rounded-lg border border-border bg-white p-7 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Account</p>
          <p className="mt-3 font-sans text-[22px] font-semibold text-text1 md:text-2xl">
            {user?.displayName ?? "—"}
          </p>
          <p className="mt-1 font-sans text-docSm text-text2">{user?.email ?? "—"}</p>
        </div>

        <div className="rounded-lg border border-border bg-white p-7 shadow-sm">
          <p className="font-sans text-label font-semibold uppercase text-text2">Role</p>
          <p className="mt-3 font-sans text-[22px] font-semibold text-text1 md:text-2xl">{roleLabel}</p>
          <p className="mt-3 font-sans text-docSm leading-6 text-textBody">
            Role is assigned server-side and controls access to manager, developer, and client-specific features.
          </p>
        </div>
      </div>
    </section>
  );
}
