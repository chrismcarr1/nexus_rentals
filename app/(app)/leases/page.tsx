import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createLeaseAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function LeasesPage() {
  const user = await requireUser();
  const [leases, units, tenants] = await Promise.all([
    db.lease.findMany({
      where: { unit: { property: { organizationId: user.organizationId } } },
      include: {
        unit: { include: { property: true } },
        tenants: { include: { tenant: true } }
      },
      orderBy: { endDate: "asc" }
    }),
    db.unit.findMany({ where: { property: { organizationId: user.organizationId } }, include: { property: true } }),
    db.tenant.findMany({ where: { organizationId: user.organizationId }, orderBy: { firstName: "asc" } })
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Lease Tracker</p>
        <div className="mt-5 space-y-3">
          {leases.map((lease) => (
            <div key={lease.id} className="rounded-[24px] border border-[var(--line)] bg-white/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{lease.unit.property.name} {lease.unit.unitNumber}</p>
                  <p className="text-sm text-stone-500">{lease.tenants.map((row) => `${row.tenant.firstName} ${row.tenant.lastName}`).join(", ")}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(lease.monthlyRent)}</p>
                  <p className="text-sm text-stone-500">{lease.status}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-stone-500">{formatDate(lease.startDate)} - {formatDate(lease.endDate)}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Create Lease</p>
        <form action={createLeaseAction} className="mt-6 space-y-4">
          <select name="unitId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.property.name} {unit.unitNumber}</option>)}
          </select>
          <select name="tenantId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName}</option>)}
          </select>
          <div className="grid gap-4 md:grid-cols-2">
            <input name="startDate" type="date" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="endDate" type="date" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <input name="monthlyRent" type="number" step="0.01" placeholder="Monthly rent" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="dueDay" type="number" placeholder="Due day" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="securityDeposit" type="number" step="0.01" placeholder="Deposit" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <textarea name="recurringCharges" placeholder="Recurring charges" className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="lateFeePolicy" placeholder="Late fee policy" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <select name="status" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <option value="ACTIVE">Active</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="EXPIRED">Expired</option>
            <option value="TERMINATED">Terminated</option>
          </select>
          <SubmitButton>Create lease</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
