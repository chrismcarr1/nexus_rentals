import { LogOut } from "lucide-react";

import { AdminDashboardClient } from "@/components/admin-dashboard-client";
import { logoutAction } from "@/lib/actions";
import { requireSystemAdmin } from "@/lib/auth";

export default async function AdminPage() {
  const user = await requireSystemAdmin();

  return (
    <main className="app-frame">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="surface-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="app-brand-mark flex h-12 w-12 items-center justify-center text-lg font-bold">
              N
            </div>
            <div>
              <p className="text-xl font-semibold text-[var(--text)]">Nexus Admin</p>
              <p className="text-sm text-[var(--muted)]">Signed in as {user.email}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel)]">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>
        </header>
        <AdminDashboardClient />
      </div>
    </main>
  );
}
