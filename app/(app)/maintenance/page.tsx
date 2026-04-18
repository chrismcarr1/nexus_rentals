import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createMaintenanceAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function MaintenancePage() {
  const user = await requireUser();
  const [items, properties, units] = await Promise.all([
    db.maintenanceRequest.findMany({
      where: { property: { organizationId: user.organizationId } },
      include: { property: true, unit: true },
      orderBy: { requestedAt: "desc" }
    }),
    db.property.findMany({ where: { organizationId: user.organizationId } }),
    db.unit.findMany({ where: { property: { organizationId: user.organizationId } }, include: { property: true } })
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Maintenance Timeline</p>
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-[var(--line)] bg-white/70 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-stone-500">{item.property.name}{item.unit ? ` • ${item.unit.unitNumber}` : ""} • Requested {formatDate(item.requestedAt)}</p>
                  <p className="mt-2 text-sm text-stone-600">{item.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{item.status}</p>
                  <p className="text-sm text-stone-500">{item.priority}</p>
                  {item.estimatedCost ? <p className="mt-2 text-sm font-semibold">{formatCurrency(item.estimatedCost)}</p> : null}
                </div>
              </div>
              <p className="mt-3 rounded-2xl bg-stone-900/5 px-3 py-2 text-sm text-stone-600">{item.timeline}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">New Maintenance Request</p>
        <form action={createMaintenanceAction} className="mt-6 space-y-4">
          <select name="propertyId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
          <select name="unitId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <option value="">No specific unit</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.property.name} {unit.unitNumber}</option>)}
          </select>
          <input name="title" placeholder="Issue title" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <textarea name="description" placeholder="Description" className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <div className="grid gap-4 md:grid-cols-2">
            <select name="status" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
              {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select name="priority" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <input name="estimatedCost" type="number" step="0.01" placeholder="Estimated cost" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="assignedTo" placeholder="Assigned vendor" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <textarea name="timeline" placeholder="Timeline or next steps" className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <SubmitButton>Create maintenance item</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
