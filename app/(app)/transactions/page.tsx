import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createPaymentAction, payRentAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { badgeToneFromPayment, getPortalContext } from "@/services/portal";

export default async function TransactionsPage() {
  const user = await requireUser();
  const portal = await getPortalContext(user);

  if (user.role === "TENANT") {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Payments"
          title="Balance clarity and a simple rent payment flow."
          description="See current amounts due, prior payment activity, and take the next rent action without digging through operational screens."
        />
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Account summary</p>
            <div className="mt-5 space-y-4">
              <div className="panel-muted rounded-[24px] p-4">
                <p className="text-sm text-[var(--muted)]">Balance due</p>
                <p className="mt-2 text-3xl font-semibold">{formatCurrency(portal.metrics.outstanding)}</p>
              </div>
              <div className="panel-muted rounded-[24px] p-4">
                <p className="text-sm text-[var(--muted)]">Next due date</p>
                <p className="mt-2 text-xl font-semibold">{portal.nextPayment ? formatDate(portal.nextPayment.dueDate) : "No outstanding balance"}</p>
              </div>
              {portal.nextPayment ? (
                <form action={payRentAction}>
                  <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
                  <SubmitButton className="w-full">Pay rent</SubmitButton>
                </form>
              ) : (
                <Button className="w-full" variant="secondary" disabled>No payment due</Button>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Payment history</p>
            <DataTable columns={["Description", "Due", "Status", "Amount"]} className="mt-5">
              {portal.scope.payments.map((payment) => (
                <tr key={payment.id} className="table-row">
                  <td className="py-4 pr-4 font-semibold">{payment.description}</td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                  <td className="py-4 pr-4"><Badge tone={badgeToneFromPayment(payment.status)}>{payment.status}</Badge></td>
                  <td className="py-4 pr-4 font-semibold">{formatCurrency(payment.amount)}</td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Collections"
        title="Payment tracking, outstanding balances, and rent capture."
        description="Focus on the ledger, delinquency follow-up, and fast payment recording for units in your current role scope."
      />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Rent ledger</p>
          <DataTable columns={["Description", "Unit", "Due", "Status", "Amount"]} className="mt-5">
            {portal.scope.payments.map((payment) => {
              const unit = portal.scope.units.find((item) => item.id === payment.unitId);
              const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;

              return (
                <tr key={payment.id} className="table-row">
                  <td className="py-4 pr-4 font-semibold">{payment.description}</td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{property?.name} {unit?.unitNumber}</td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                  <td className="py-4 pr-4"><Badge tone={badgeToneFromPayment(payment.status)}>{payment.status}</Badge></td>
                  <td className="py-4 pr-4 text-right font-semibold">{formatCurrency(payment.amount)}</td>
                </tr>
              );
            })}
          </DataTable>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Record payment</p>
          <form action={createPaymentAction} className="mt-6 space-y-4">
            <select name="unitId" className="field">
              {portal.scope.units.map((unit) => {
                const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                return <option key={unit.id} value={unit.id}>{property?.name} {unit.unitNumber}</option>;
              })}
            </select>
            <select name="leaseId" className="field">
              <option value="">No linked lease</option>
              {portal.scope.leases.map((lease) => {
                const unit = portal.scope.units.find((item) => item.id === lease.unitId);
                return <option key={lease.id} value={lease.id}>{unit?.unitNumber} lease</option>;
              })}
            </select>
            <input name="description" placeholder="Description" className="field" />
            <div className="grid gap-4 md:grid-cols-2">
              <input name="amount" type="number" step="0.01" placeholder="Amount" className="field" />
              <input name="dueDate" type="date" className="field" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input name="paidDate" type="date" className="field" />
              <select name="status" className="field">
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="PARTIAL">Partial</option>
                <option value="LATE">Late</option>
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input name="lateFeeAmount" type="number" step="0.01" placeholder="Late fee" className="field" />
              <input name="balanceDue" type="number" step="0.01" placeholder="Balance due" className="field" />
            </div>
            <input name="categoryTag" placeholder="Category/tag" className="field" />
            <SubmitButton>Save payment</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
