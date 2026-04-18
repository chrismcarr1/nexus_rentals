import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createExpenseAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatDate, parseTags } from "@/lib/utils";

export default async function ExpensesPage() {
  const user = await requireUser();
  const [expenses, properties, units] = await Promise.all([
    db.expense.findMany({
      where: { property: { organizationId: user.organizationId } },
      include: { property: true, unit: true },
      orderBy: { incurredAt: "desc" }
    }),
    db.property.findMany({ where: { organizationId: user.organizationId } }),
    db.unit.findMany({ where: { property: { organizationId: user.organizationId } }, include: { property: true } })
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Expense Register</p>
        <div className="mt-5 space-y-3">
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-[24px] border border-[var(--line)] bg-white/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{expense.title}</p>
                  <p className="text-sm text-stone-500">{expense.property.name}{expense.unit ? ` • ${expense.unit.unitNumber}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(expense.amount)}</p>
                  <p className="text-sm text-stone-500">{formatDate(expense.incurredAt)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {parseTags(expense.tags).map((tag) => <span key={tag} className="rounded-full bg-stone-900/5 px-3 py-1 text-xs font-semibold">{tag}</span>)}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Record Expense</p>
        <form action={createExpenseAction} className="mt-6 space-y-4">
          <select name="propertyId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
          <select name="unitId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <option value="">No specific unit</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.property.name} {unit.unitNumber}</option>)}
          </select>
          <input name="title" placeholder="Expense title" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <textarea name="description" placeholder="Description" className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <div className="grid gap-4 md:grid-cols-2">
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="incurredAt" type="date" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <select name="category" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            {["MAINTENANCE", "REPAIR", "UTILITIES", "INSURANCE", "TAX", "CLEANING", "MARKETING", "OTHER"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input name="vendor" placeholder="Vendor" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="tags" placeholder="Tags, comma separated" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <SubmitButton>Save expense</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
