import { LogOut } from "lucide-react";

import { AdminDashboardClient } from "@/components/admin-dashboard-client";
import { logoutAction } from "@/lib/actions";
import { requireSystemAdmin } from "@/lib/auth";

export default async function AdminPage() {
  const user = await requireSystemAdmin();

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="surface-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#1f6b5f,#174a43)] text-lg font-bold text-white shadow-[0_18px_32px_rgba(22,74,67,0.24)]">
              N
            </div>
            <div>
              <p className="text-xl font-semibold tracking-[-0.03em] text-[var(--text)]">Nexus Admin</p>
              <p className="text-sm text-[var(--muted)]">Signed in as {user.email}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel)]">
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
