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
        title="Expenses"
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
                      <p className="mt-0.5 text-sm text-[var(--muted)]">
                        {property?.name}
                        {unit ? ` - ${unit.unitNumber}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="font-semibold">{formatCurrency(expense.amount)}</p>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">{formatDate(expense.incurredAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {parseTags(expense.tags).map((tag) => (
                      <span key={tag} className="status-badge border border-[var(--line)] bg-[var(--panel)] px-3 text-xs font-semibold text-[var(--muted-strong)]">
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
            <label className="block">
              <span className="field-label">Property</span>
              <select name="propertyId" className="field">
                {portal.scope.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Unit</span>
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
            </label>
            <label className="block">
              <span className="field-label">Expense title</span>
              <input name="title" placeholder="e.g. HVAC service call" className="field" />
            </label>
            <label className="block">
              <span className="field-label">Description</span>
              <textarea name="description" placeholder="Add context for reports and recordkeeping" className="field min-h-24" />
            </label>
            <div className="form-grid-2">
              <label className="block">
                <span className="field-label">Amount</span>
                <input name="amount" type="number" step="0.01" placeholder="0.00" className="field" />
              </label>
              <label className="block">
                <span className="field-label">Date incurred</span>
                <input name="incurredAt" type="date" className="field" />
              </label>
            </div>
            <label className="block">
              <span className="field-label">Category</span>
              <select name="category" className="field">
                {["MAINTENANCE", "REPAIR", "UTILITIES", "INSURANCE", "TAX", "CLEANING", "MARKETING", "OTHER"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Vendor</span>
              <input name="vendor" placeholder="Vendor or payee" className="field" />
            </label>
            <label className="block">
              <span className="field-label">Tags</span>
              <input name="tags" placeholder="Comma separated, e.g. plumbing, turnover" className="field" />
            </label>
            <SubmitButton>Save expense</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
