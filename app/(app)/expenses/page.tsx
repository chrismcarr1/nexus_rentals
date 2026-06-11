import { Receipt } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createExpenseAction } from "@/lib/actions";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { formatCurrency, formatDate, parseTags } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function ExpensesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const expenses = [...portal.scope.expenses].sort((a, b) => b.incurredAt.localeCompare(a.incurredAt));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Expense operations"
        title={user.role === "ADMIN" ? "Operating spend across the full portfolio." : "Expense tracking for your assigned properties."}
        description="Record vendor costs, tag operating spend, and keep unit-level expenses connected to the same data used by reports and dashboards."
      />
      <div className="content-split">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Expense register</p>
          <div className="mt-5 space-y-3">
            {expenses.length === 0 ? <EmptyState icon={Receipt} title="No expenses yet" description="New expense entries will appear here as soon as they are recorded." /> : null}
            {expenses.map((expense) => {
              const property = portal.scope.properties.find((item) => item.id === expense.propertyId);
              const unit = expense.unitId ? portal.scope.units.find((item) => item.id === expense.unitId) : null;

              return (
                <div key={expense.id} className="panel-muted p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{expense.title}</p>
                      <p className="text-sm text-stone-500">
                        {property?.name}
                        {unit ? ` - ${unit.unitNumber}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="font-semibold">{formatCurrency(expense.amount)}</p>
                      <p className="text-sm text-stone-500">{formatDate(expense.incurredAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {parseTags(expense.tags).map((tag) => (
                      <span key={tag} className="rounded-full bg-stone-900/5 px-3 py-1 text-xs font-semibold">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Record expense</p>
          {params.error === "invalid-expense" ? (
            <div className="page-alert page-alert-warning mt-4">
              Review the expense details. Property, title, amount, date, and category are required.
            </div>
          ) : null}
          <form action={createExpenseAction} className="mt-6 space-y-4">
            <select name="propertyId" className="field">
              {portal.scope.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <select name="unitId" className="field">
              <option value="">No specific unit</option>
              {portal.scope.units.map((unit) => {
                const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                return (
                  <option key={unit.id} value={unit.id}>
                    {property?.name} {unit.unitNumber}
                  </option>
                );
              })}
            </select>
            <input name="title" placeholder="Expense title" className="field" />
            <textarea name="description" placeholder="Description" className="field min-h-24" />
            <div className="form-grid-2">
              <input name="amount" type="number" step="0.01" placeholder="Amount" className="field" />
              <input name="incurredAt" type="date" className="field" />
            </div>
            <select name="category" className="field">
              {["MAINTENANCE", "REPAIR", "UTILITIES", "INSURANCE", "TAX", "CLEANING", "MARKETING", "OTHER"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input name="vendor" placeholder="Vendor" className="field" />
            <input name="tags" placeholder="Tags, comma separated" className="field" />
            <SubmitButton>Save expense</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
