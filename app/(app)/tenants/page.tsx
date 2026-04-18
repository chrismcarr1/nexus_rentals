import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createTenantAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function TenantsPage() {
  const user = await requireUser();
  const tenants = await db.tenant.findMany({
    where: { organizationId: user.organizationId },
    include: {
      leaseTenants: {
        include: { lease: { include: { unit: { include: { property: true } } } } }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Tenant Directory</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-xs uppercase tracking-[0.2em] text-stone-400">
              <tr>
                <th className="pb-3">Name</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Employer</th>
                <th className="pb-3">Current Unit</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const currentLease = tenant.leaseTenants[0]?.lease;
                return (
                  <tr key={tenant.id} className="border-t border-[var(--line)] text-sm">
                    <td className="py-4 font-semibold">{tenant.firstName} {tenant.lastName}</td>
                    <td className="py-4 text-stone-500">{tenant.email || "No email"}<br />{tenant.phone || "No phone"}</td>
                    <td className="py-4 text-stone-500">{tenant.employer || "Not set"}</td>
                    <td className="py-4 text-stone-500">{currentLease ? `${currentLease.unit.property.name} ${currentLease.unit.unitNumber}` : "No active lease"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Add Tenant</p>
        <form action={createTenantAction} className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <input name="firstName" placeholder="First name" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="lastName" placeholder="Last name" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <input name="email" type="email" placeholder="Email" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="phone" placeholder="Phone" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="employer" placeholder="Employer" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <textarea name="notes" placeholder="Notes" className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <SubmitButton>Create tenant</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
