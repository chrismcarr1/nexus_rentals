import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminAccountEditor } from "@/components/admin/admin-account-editor";
import { AdminMetricCard } from "@/components/admin/admin-metric-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminStatGrid } from "@/components/admin/admin-stat-grid";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { getAdminAnalytics } from "@/lib/admin-analytics";
import { requireSystemAdmin } from "@/lib/auth";
import { getUserById } from "@/lib/store";
import { formatAppDateTime } from "@/lib/app-time";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireSystemAdmin();
  const { userId } = await params;
  const [data, sourceUser] = await Promise.all([getAdminAnalytics("all"), getUserById(userId)]);
  const user = data.users.find((item) => item.id === userId);
  if (!user || !sourceUser) notFound();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={user.name}
        description={`${user.email} · ${user.organization} · Account created ${formatAppDateTime(user.createdAt)}`}
        actions={<Link href="/admin/users" className="text-sm font-semibold text-[var(--brand)]">Back to users</Link>}
      />
      <AdminStatGrid>
        <AdminMetricCard label="Role" value={user.role} detail={user.status} tone="brand" />
        <AdminMetricCard label="Properties" value={user.propertyCount} detail={`${user.unitCount} linked units`} />
        <AdminMetricCard label="Leases" value={user.leaseCount} detail={`${user.paymentCount} payments`} />
        <AdminMetricCard label="Last login" value={user.lastLoginAt ? "Recorded" : "Not recorded"} detail={user.lastLoginAt ? formatAppDateTime(user.lastLoginAt) : "Tracking begins after deployment"} tone={user.lastLoginAt ? "success" : "warning"} />
      </AdminStatGrid>
      <section className="ops-split">
        <AdminSection title="Account details" description="Safe account metadata editing through the existing admin API.">
          <AdminAccountEditor
            account={{
              id: sourceUser.id,
              firstName: sourceUser.firstName,
              lastName: sourceUser.lastName,
              email: sourceUser.email,
              role: user.role,
              isActive: sourceUser.isActive !== false,
              phone: sourceUser.phone,
              title: sourceUser.title
            }}
          />
        </AdminSection>
        <AdminSection title="Linked account state" description="Current role-specific platform relationships.">
          <div className="space-y-3">
            {[
              ["Account status", user.status],
              ["Stripe status", user.stripeStatus],
              ["Invite status", user.inviteStatus],
              ["Organization", user.organization],
              ["Created", formatAppDateTime(user.createdAt)],
              ["Last login", user.lastLoginAt ? formatAppDateTime(user.lastLoginAt) : "Not recorded"]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
                <span className="text-sm font-semibold">{label}</span>
                {label.includes("status") ? <AdminStatusBadge status={value} /> : <span className="text-right text-sm text-[var(--muted)]">{value}</span>}
              </div>
            ))}
          </div>
          {user.role === "MANAGER" ? (
            <Link href={`/admin/managers/${user.id}`} className="mt-4 inline-flex text-sm font-semibold text-[var(--brand)]">Open manager control page</Link>
          ) : null}
        </AdminSection>
      </section>
    </div>
  );
}
