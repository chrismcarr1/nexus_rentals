import { AdminShell } from "@/components/admin/admin-shell";
import { logoutAction } from "@/lib/actions";
import { requireSystemAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSystemAdmin();

  return (
    <AdminShell
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }}
      logoutAction={logoutAction}
    >
      {children}
    </AdminShell>
  );
}
