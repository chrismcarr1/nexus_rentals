import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createPaymentAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function TransactionsPage() {
  const user = await requireUser();
  const [payments, units, leases] = await Promise.all([
    db.payment.findMany({
      where: { unit: { property: { organizationId: user.organizationId } } },
      include: { unit: { include: { property: true } } },
      orderBy: { dueDate: "desc" }
    }),
    db.unit.findMany({ where: { property: { organizationId: user.organizationId } }, include: { property: true } }),
    db.lease.findMany({ where: { unit: { property: { organizationId: user.organizationId } } }, include: { unit: true } })
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Rent Ledger</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-stone-400">
              <tr>
                <th className="pb-3">Description</th>
                <th className="pb-3">Unit</th>
                <th className="pb-3">Due</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-t border-[var(--line)]">
                  <td className="py-4 font-semibold">{payment.description}</td>
                  <td className="py-4 text-stone-500">{payment.unit.property.name} {payment.unit.unitNumber}</td>
                  <td className="py-4 text-stone-500">{formatDate(payment.dueDate)}</td>
                  <td className="py-4 text-stone-500">{payment.status}</td>
                  <td className="py-4 text-right font-semibold">{formatCurrency(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Record Payment</p>
        <form action={createPaymentAction} className="mt-6 space-y-4">
          <select name="unitId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.property.name} {unit.unitNumber}</option>)}
          </select>
          <select name="leaseId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <option value="">No linked lease</option>
            {leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.unit.unitNumber} lease</option>)}
          </select>
          <input name="description" placeholder="Description" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <div className="grid gap-4 md:grid-cols-2">
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="dueDate" type="date" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <input name="paidDate" type="date" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <select name="status" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="LATE">Late</option>
            </select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <input name="lateFeeAmount" type="number" step="0.01" placeholder="Late fee" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="balanceDue" type="number" step="0.01" placeholder="Balance due" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <input name="categoryTag" placeholder="Category/tag" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <SubmitButton>Save payment</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
