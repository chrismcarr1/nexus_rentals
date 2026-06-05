import Link from "next/link";
import { addDays, differenceInCalendarDays, endOfMonth, isAfter, isBefore, startOfMonth, startOfYear } from "date-fns";
import {
  Banknote,
  BookOpenCheck,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  Plus,
  ReceiptText,
  Send,
  ShieldCheck,
  Upload
} from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { SearchInput } from "@/components/search-input";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createPaymentAction, createStripeCheckoutAction, deletePaymentAction, updatePaymentAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getStripeConnectState } from "@/lib/stripe-connect";
import { formatCurrency, formatDate } from "@/lib/utils";
import { badgeToneFromPayment, getPortalContext } from "@/services/portal";

type PaymentsTab = "collections" | "payments" | "accounting";

function stripeStatusMessage(status?: string) {
  if (status === "success") return "Stripe checkout completed. Your payment status will update as soon as Stripe confirms the webhook.";
  if (status === "cancelled") return "Stripe checkout was cancelled. No payment was recorded.";
  if (status === "invalid-payment") return "That rent payment could not be found for your tenant account.";
  if (status === "already-paid") return "That rent payment is already marked paid.";
  if (status === "missing-lease") return "This rent charge is not connected to an active lease. Ask your manager to link the charge to your lease or unit.";
  if (status === "manager-missing") return "This charge is not connected to a manager payout account. Ask management to assign the property manager before paying online.";
  if (status === "manager-setup-required") return "Online checkout is not available yet because the property manager still needs to finish Stripe payout setup.";
  if (status === "invalid-amount") return "This rent charge has no payable balance.";
  if (status === "amount-below-platform-fee") return "Stripe checkout requires the rent balance to be greater than the $1 Nexus platform fee.";
  if (status === "checkout-error") return "Stripe checkout could not be started. Please try again or contact management.";
  if (status === "missing-session-url") return "Stripe did not return a checkout link. Please try again.";
  if (status === "payment-linked") return "Rent charge saved and linked to the active lease for that unit.";
  if (status === "payment-unlinked") return "Rent charge saved, but no active lease was found for that unit yet.";
  if (status) return "Stripe checkout could not continue for this payment.";
  return null;
}

function paymentsHref(params: Record<string, string>, updates: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return `/transactions${query ? `?${query}` : ""}`;
}

function tabHref(params: Record<string, string>, tab: PaymentsTab) {
  return paymentsHref(params, {
    tab: tab === "collections" ? undefined : tab,
    charge: undefined,
    payment: undefined,
    ledger: undefined,
    create: undefined,
    sort: undefined
  });
}

function formatDateOrUnset(value?: string | null) {
  return value ? formatDate(value) : "Not posted";
}

function paidDateFor(payment: { paidDate?: string; stripePaidAt?: string }) {
  return payment.paidDate ?? payment.stripePaidAt;
}

function paidAmountFor(payment: { amount: number; amountPaid?: number; stripeAmountPaidCents?: number }) {
  return payment.amountPaid ?? (typeof payment.stripeAmountPaidCents === "number" ? payment.stripeAmountPaidCents / 100 : payment.amount);
}

function balanceFor(payment: { amount: number; balanceDue: number; amountPaid?: number }) {
  if (payment.balanceDue > 0) return payment.balanceDue;
  if (typeof payment.amountPaid === "number") return Math.max(0, payment.amount - payment.amountPaid);
  return payment.amount;
}

function referenceFor(payment: { id: string; stripePaymentIntentId?: string; stripeCheckoutSessionId?: string }) {
  return payment.stripePaymentIntentId ?? payment.stripeCheckoutSessionId ?? payment.id.slice(-8).toUpperCase();
}

function methodFor(payment: { stripeCheckoutSessionId?: string }) {
  return payment.stripeCheckoutSessionId ? "Stripe" : "Manual";
}

function normalizeCategory(value?: string, description?: string) {
  const source = `${value ?? ""} ${description ?? ""}`.toLowerCase();
  if (source.includes("deposit")) return "Deposit";
  if (source.includes("late")) return "Late Fee";
  if (source.includes("pet")) return "Pet Fee";
  if (source.includes("parking")) return "Parking";
  if (source.includes("utility") || source.includes("utilities")) return "Utility Reimbursement";
  if (source.includes("application")) return "Application Fee";
  if (source.includes("rent")) return "Rent";
  return value?.trim() || "Other";
}

function taxClassification(category: string) {
  if (category === "Deposit") return "Security deposit liability";
  if (category === "Rent") return "Rental income";
  if (category === "Late Fee" || category === "Pet Fee" || category === "Parking" || category === "Application Fee") return "Fee income";
  if (category === "Utility Reimbursement") return "Reimbursement income";
  return "Other income";
}

function collectionStatus(payment: { status: string; dueDate: string }) {
  const today = new Date();
  const daysLate = differenceInCalendarDays(today, new Date(payment.dueDate));
  const daysUntilDue = differenceInCalendarDays(new Date(payment.dueDate), today);

  if (payment.status === "PARTIAL") return { label: "Partial", tone: "warning" as const };
  if (daysLate >= 30) return { label: "Severely Late", tone: "danger" as const };
  if (daysLate > 0 || payment.status === "LATE") return { label: "Late", tone: "danger" as const };
  if (daysUntilDue <= 7) return { label: "Due Soon", tone: "warning" as const };
  return { label: "Pending", tone: "default" as const };
}

function withinYear(value: string | undefined, year: number) {
  if (!value) return false;
  return new Date(value).getFullYear() === year;
}

export default async function TransactionsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const portal = await getPortalContext(user);
  const stripeMessage = stripeStatusMessage(params.stripe);
  const nextPaymentAmount = portal.nextPayment ? portal.nextPayment.balanceDue || portal.nextPayment.amount : 0;

  if (user.role === "TENANT") {
    const currentTenantId = portal.currentTenant?.id;
    const tenantLeaseIds = new Set(
      portal.scope.leases
        .filter((lease) => lease.tenantUserId === user.id || (currentTenantId ? lease.tenantIds.includes(currentTenantId) : false))
        .map((lease) => lease.id)
    );
    const tenantPaymentHistory = portal.scope.payments
      .filter((payment) => {
        if (payment.tenantId) return currentTenantId ? payment.tenantId === currentTenantId : false;
        if (payment.leaseId) return tenantLeaseIds.has(payment.leaseId);
        return false;
      })
      .sort((a, b) => (b.paidDate ?? b.dueDate).localeCompare(a.paidDate ?? a.dueDate));

    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Payments"
          title="Balance clarity and a simple rent payment flow."
          description="See current amounts due, prior payment activity, and take the next rent action without digging through operational screens."
          actions={
            portal.nextPayment ? (
              <form action={createStripeCheckoutAction}>
                <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
                <SubmitButton pendingLabel="Opening Stripe...">
                  <CreditCard className="h-4 w-4" />
                  Pay rent with Stripe
                </SubmitButton>
              </form>
            ) : (
              <Button variant="secondary" disabled>
                <ShieldCheck className="h-4 w-4" />
                No payment due
              </Button>
            )
          }
        />
        {stripeMessage ? (
          <Card className="p-4">
            <p className="text-sm font-semibold text-[var(--text)]">{stripeMessage}</p>
          </Card>
        ) : null}
        <Card className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--brand)]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Stripe Checkout</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--text)]">
                  {portal.nextPayment ? `Ready to pay ${formatCurrency(nextPaymentAmount)}` : "Online rent checkout is ready"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Card details stay with Stripe. Nexus Rentals only receives the paid status, session id, payment intent, amount, and timestamp.
                </p>
              </div>
            </div>
            {portal.nextPayment ? (
              <form action={createStripeCheckoutAction} className="shrink-0">
                <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
                <SubmitButton pendingLabel="Opening Stripe...">
                  <CreditCard className="h-4 w-4" />
                  Pay rent
                </SubmitButton>
              </form>
            ) : (
              <Button variant="secondary" disabled className="shrink-0">Paid up</Button>
            )}
          </div>
        </Card>
        <div className="content-split-tight">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Account summary</p>
            <div className="mt-5 space-y-4">
              <div className="panel-muted p-4">
                <p className="text-sm text-[var(--muted)]">Balance due</p>
                <p className="mt-2 text-3xl font-semibold">{formatCurrency(portal.metrics.outstanding)}</p>
              </div>
              <div className="panel-muted p-4">
                <p className="text-sm text-[var(--muted)]">Next due date</p>
                <p className="mt-2 text-xl font-semibold">{portal.nextPayment ? formatDate(portal.nextPayment.dueDate) : "No outstanding balance"}</p>
              </div>
              {portal.nextPayment ? (
                <form action={createStripeCheckoutAction}>
                  <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
                  <SubmitButton className="w-full" pendingLabel="Opening Stripe...">Pay rent with Stripe</SubmitButton>
                </form>
              ) : (
                <Button className="w-full" variant="secondary" disabled>No payment due</Button>
              )}
              <p className="text-xs leading-5 text-[var(--muted)]">
                Payments are processed through Stripe Checkout. Nexus Rentals never sees or stores card details.
              </p>
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Payment history</p>
            {tenantPaymentHistory.length ? (
              <DataTable columns={["Description", "Due", "Status", "Channel", "Amount", "Reference", "Action"]} className="mt-5">
                {tenantPaymentHistory.map((payment) => (
                  <tr key={payment.id} className="table-row">
                    <td className="py-4 pr-4 font-semibold">{payment.description}</td>
                    <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                    <td className="py-4 pr-4"><Badge tone={badgeToneFromPayment(payment.status)}>{payment.status}</Badge></td>
                    <td className="py-4 pr-4 text-[var(--muted)]">{methodFor(payment)}</td>
                    <td className="py-4 pr-4 font-semibold">{formatCurrency(payment.status === "PAID" ? paidAmountFor(payment) : balanceFor(payment))}</td>
                    <td className="py-4 pr-4 font-mono text-xs text-[var(--muted)]">{referenceFor(payment)}</td>
                    <td className="py-4 pr-4">
                      {payment.status !== "PAID" ? (
                        <form action={createStripeCheckoutAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <SubmitButton pendingLabel="Opening..." className="button-compact px-3">
                            <CreditCard className="h-4 w-4" />
                            Pay
                          </SubmitButton>
                        </form>
                      ) : (
                        <Badge tone="success">Paid</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <div className="mt-5">
                <EmptyState title="No payment history yet" description="Tenant-linked payments and charges will appear here once your manager creates them." />
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  const activeTab: PaymentsTab = params.tab === "payments" || params.tab === "accounting" ? params.tab : "collections";
  const today = new Date();
  const next30 = addDays(today, 30);
  const currentYear = new Date().getFullYear();
  const selectedYear = Number(params.year ?? currentYear) || currentYear;
  const propertyFilter = params.propertyId ?? "all";
  const statusFilter = params.status ?? "all";
  const methodFilter = params.method ?? "all";
  const tenantFilter = params.tenantId ?? "all";
  const categoryFilter = params.category ?? "all";
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;
  const query = params.q?.trim().toLowerCase() ?? "";
  const createMode = params.create;
  const selectedUnitId = portal.scope.units.some((unit) => unit.id === params.unitId) ? params.unitId : "";
  const selectedLeaseId = portal.scope.leases.some((lease) => lease.id === params.leaseId) ? params.leaseId : "";
  const selectedLeaseForForm = selectedLeaseId ? portal.scope.leases.find((lease) => lease.id === selectedLeaseId) ?? null : null;
  const selectedTenantId = portal.scope.tenants.some((tenant) => tenant.id === params.tenantId)
    ? params.tenantId ?? ""
    : selectedLeaseForForm?.tenantIds?.[0] ?? "";

  const managerConnectState = getStripeConnectState(user);
  const managerPaymentsReady = managerConnectState.ready;

  const rows = portal.scope.payments.map((payment) => {
    const unit = portal.scope.units.find((item) => item.id === payment.unitId) ?? null;
    const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) ?? null : null;
    const lease = payment.leaseId ? portal.scope.leases.find((item) => item.id === payment.leaseId) ?? null : null;
    const directTenant = payment.tenantId ? portal.scope.tenants.find((tenant) => tenant.id === payment.tenantId) ?? null : null;
    const leaseTenants = lease ? portal.scope.tenants.filter((tenant) => lease.tenantIds.includes(tenant.id)) : [];
    const tenants = directTenant ? [directTenant] : leaseTenants;
    const primaryTenant = directTenant ?? leaseTenants[0] ?? null;
    const tenantLabel = directTenant
      ? `${directTenant.firstName} ${directTenant.lastName}`
      : leaseTenants.length
        ? leaseTenants.map((tenant) => `${tenant.firstName} ${tenant.lastName}`).join(", ")
        : lease?.tenantEmail ?? "No tenant";
    const category = normalizeCategory(payment.categoryTag, payment.description);
    const method = methodFor(payment);
    const paidAt = paidDateFor(payment);
    const daysLate = Math.max(0, differenceInCalendarDays(today, new Date(payment.dueDate)));
    const amountDue = balanceFor(payment);
    const amountPaid = paidAmountFor(payment);
    const searchText = [
      tenantLabel,
      tenants.map((tenant) => tenant.email).join(" "),
      property?.name,
      unit?.unitNumber,
      payment.description,
      category,
      payment.status,
      method,
      referenceFor(payment)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return { payment, unit, property, lease, tenants, primaryTenant, tenantLabel, category, method, paidAt, daysLate, amountDue, amountPaid, searchText };
  });

  const collectionsRows = rows
    .filter((row) => row.payment.status !== "PAID")
    .filter((row) => {
      const status = collectionStatus(row.payment).label;
      if (query && !row.searchText.includes(query)) return false;
      if (propertyFilter !== "all" && row.property?.id !== propertyFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (params.sort === "tenant") return a.tenantLabel.localeCompare(b.tenantLabel);
      if (params.sort === "property") return (a.property?.name ?? "").localeCompare(b.property?.name ?? "");
      if (params.sort === "amount") return b.amountDue - a.amountDue;
      if (params.sort === "daysLate") return b.daysLate - a.daysLate;
      return a.payment.dueDate.localeCompare(b.payment.dueDate);
    });

  const paidRows = rows
    .filter((row) => row.payment.status === "PAID" && row.paidAt)
    .filter((row) => {
      const paidDate = row.paidAt ? new Date(row.paidAt) : null;
      if (query && !row.searchText.includes(query)) return false;
      if (propertyFilter !== "all" && row.property?.id !== propertyFilter) return false;
      if (tenantFilter !== "all" && !row.tenants.some((tenant) => tenant.id === tenantFilter)) return false;
      if (methodFilter !== "all" && row.method.toLowerCase() !== methodFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (dateFrom && paidDate && isBefore(paidDate, new Date(dateFrom))) return false;
      if (dateTo && paidDate && isAfter(paidDate, new Date(dateTo))) return false;
      return true;
    })
    .sort((a, b) => {
      if (params.sort === "tenant") return a.tenantLabel.localeCompare(b.tenantLabel);
      if (params.sort === "property") return (a.property?.name ?? "").localeCompare(b.property?.name ?? "");
      if (params.sort === "amount") return b.amountPaid - a.amountPaid;
      if (params.sort === "category") return a.category.localeCompare(b.category);
      return (b.paidAt ?? "").localeCompare(a.paidAt ?? "");
    });

  const accountingRows = rows
    .filter((row) => row.payment.status === "PAID" && withinYear(row.paidAt, selectedYear))
    .filter((row) => {
      if (query && !row.searchText.includes(query)) return false;
      if (propertyFilter !== "all" && row.property?.id !== propertyFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      return true;
    })
    .map((row) => ({
      ...row,
      taxClassification: taxClassification(row.category)
    }))
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));

  const outstandingBalance = rows.filter((row) => row.payment.status !== "PAID").reduce((sum, row) => sum + row.amountDue, 0);
  const overdueRows = rows.filter((row) => row.payment.status !== "PAID" && (row.daysLate > 0 || row.payment.status === "LATE"));
  const overdueBalance = overdueRows.reduce((sum, row) => sum + row.amountDue, 0);
  const upcomingBalance = rows
    .filter((row) => row.payment.status !== "PAID" && isAfter(new Date(row.payment.dueDate), today) && isBefore(new Date(row.payment.dueDate), next30))
    .reduce((sum, row) => sum + row.amountDue, 0);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const monthPaid = rows
    .filter((row) => row.payment.status === "PAID" && row.paidAt && isAfter(new Date(row.paidAt), monthStart) && isBefore(new Date(row.paidAt), monthEnd))
    .reduce((sum, row) => sum + row.amountPaid, 0);
  const monthDue = rows
    .filter((row) => isAfter(new Date(row.payment.dueDate), monthStart) && isBefore(new Date(row.payment.dueDate), monthEnd))
    .reduce((sum, row) => sum + row.payment.amount, 0);
  const collectionRate = monthDue ? Math.round((monthPaid / monthDue) * 100) : 100;

  const yearStart = startOfYear(today);
  const collectedThisYear = rows
    .filter((row) => row.payment.status === "PAID" && row.paidAt && isAfter(new Date(row.paidAt), yearStart))
    .reduce((sum, row) => sum + row.amountPaid, 0);
  const pendingStripeTransferRows = rows.filter(
    (row) => row.payment.status === "PAID" && row.method === "Stripe" && !row.payment.stripeDestinationAccountId
  );
  const averageCollectionTime = (() => {
    const completed = rows.filter((row) => row.payment.status === "PAID" && row.paidAt);
    if (!completed.length) return "0 days";
    const average = completed.reduce((sum, row) => sum + differenceInCalendarDays(new Date(row.paidAt!), new Date(row.payment.dueDate)), 0) / completed.length;
    return `${Math.max(0, Math.round(average))} days`;
  })();

  const rentIncomeYtd = accountingRows.filter((row) => row.category === "Rent").reduce((sum, row) => sum + row.amountPaid, 0);
  const depositsHeld = accountingRows.filter((row) => row.category === "Deposit").reduce((sum, row) => sum + row.amountPaid, 0);
  const lateFeesCollected = accountingRows
    .filter((row) => row.category === "Late Fee")
    .reduce((sum, row) => sum + row.amountPaid, 0);
  const otherIncome = accountingRows
    .filter((row) => row.category !== "Rent" && row.category !== "Deposit" && row.category !== "Late Fee")
    .reduce((sum, row) => sum + row.amountPaid, 0);

  const priorityRows = rows
    .filter((row) => row.payment.status !== "PAID")
    .sort((a, b) => b.daysLate - a.daysLate || b.amountDue - a.amountDue)
    .slice(0, 8);
  const categoryOptions = Array.from(new Set(rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b));
  const selectedCollection = rows.find((row) => row.payment.id === params.charge && row.payment.status !== "PAID");
  const selectedPayment = rows.find((row) => row.payment.id === params.payment && row.payment.status === "PAID");
  const selectedLedger = accountingRows.find((row) => row.payment.id === params.ledger);
  const selectedEditPayment = rows.find((row) => row.payment.id === params.editPayment);
  const selectedDeletePayment = rows.find((row) => row.payment.id === params.deletePayment);
  const paymentMutationReturnHref = paymentsHref(params, { editPayment: undefined, deletePayment: undefined });

  return (
    <div className="payments-workflow space-y-4">
      <PageHeader
        eyebrow="Payments"
        title="Collections, payments, and accounting."
        description="A financial operations center for who owes money, who paid, and what income is ready for bookkeeping."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/settings#payments-stripe" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]">
              <Badge tone={managerPaymentsReady ? "success" : managerConnectState.tone}>{managerPaymentsReady ? "Stripe connected" : managerConnectState.label}</Badge>
            </Link>
            <details className="new-action-menu relative">
              <summary className="new-action-trigger">
                <Plus className="h-4 w-4" />
                New
                <ChevronDown className="h-4 w-4" />
              </summary>
              <div className="new-action-panel">
                <Link href={`${paymentsHref(params, { create: "record", tab: "payments" })}#new-payment`} className="new-action-item">Record Payment</Link>
                <Link href={`${paymentsHref(params, { create: "charge", tab: undefined })}#new-payment`} className="new-action-item">Create Charge</Link>
                <Link href={`${paymentsHref(params, { create: "request", tab: undefined })}#new-payment`} className="new-action-item">Send Payment Request</Link>
                <Link href={`${paymentsHref(params, { create: "import", tab: "payments" })}#import-transactions`} className="new-action-item">Import Transactions</Link>
              </div>
            </details>
          </div>
        }
      />

      {stripeMessage ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-[var(--text)]">{stripeMessage}</p>
        </Card>
      ) : null}

      <nav className="payments-tabs surface-panel p-1" aria-label="Payments sections">
        <Link href={tabHref(params, "collections")} className={`payments-tab ${activeTab === "collections" ? "payments-tab-active" : ""}`}>
          <Banknote className="h-4 w-4" />
          Collections
          <span>{rows.filter((row) => row.payment.status !== "PAID").length}</span>
        </Link>
        <Link href={tabHref(params, "payments")} className={`payments-tab ${activeTab === "payments" ? "payments-tab-active" : ""}`}>
          <ReceiptText className="h-4 w-4" />
          Payments
          <span>{rows.filter((row) => row.payment.status === "PAID").length}</span>
        </Link>
        <Link href={tabHref(params, "accounting")} className={`payments-tab ${activeTab === "accounting" ? "payments-tab-active" : ""}`}>
          <BookOpenCheck className="h-4 w-4" />
          Accounting
          <span>{selectedYear}</span>
        </Link>
      </nav>

      {activeTab === "collections" ? (
        <>
          <section className="ops-grid">
            <StatCard label="Outstanding Balance" value={formatCurrency(outstandingBalance)} detail={`${rows.filter((row) => row.payment.status !== "PAID").length} open charges`} tone={outstandingBalance ? "warning" : "success"} />
            <StatCard label="Overdue Charges" value={formatCurrency(overdueBalance)} detail={`${overdueRows.length} needs follow-up`} tone={overdueBalance ? "danger" : "success"} />
            <StatCard label="Upcoming Charges" value={formatCurrency(upcomingBalance)} detail="Due in next 30 days" tone="brand" />
            <StatCard label="Collection Rate This Month" value={`${collectionRate}%`} detail={`${formatCurrency(monthPaid)} collected`} tone={collectionRate >= 95 ? "success" : collectionRate >= 75 ? "warning" : "danger"} />
          </section>

          <div className="payments-main-grid">
            <DetailSection
              title="Outstanding charges"
              description="Start here: every unpaid balance, sorted and filterable for daily collection work."
              actions={<Badge tone={collectionsRows.length ? "warning" : "success"}>{collectionsRows.length} open</Badge>}
            >
              <FilterBar
                action="/transactions"
                query={params.q}
                queryPlaceholder="Search tenant, property, unit, or charge"
                hidden={{ sort: params.sort }}
                filters={[
                  {
                    name: "propertyId",
                    label: "Property",
                    value: propertyFilter,
                    options: [
                      { label: "All properties", value: "all" },
                      ...portal.scope.properties.map((property) => ({ label: property.name, value: property.id }))
                    ]
                  },
                  {
                    name: "status",
                    label: "Status",
                    value: statusFilter,
                    options: [
                      { label: "All statuses", value: "all" },
                      { label: "Due Soon", value: "Due Soon" },
                      { label: "Pending", value: "Pending" },
                      { label: "Partial", value: "Partial" },
                      { label: "Late", value: "Late" },
                      { label: "Severely Late", value: "Severely Late" }
                    ]
                  }
                ]}
              />
              {collectionsRows.length ? (
                <DataTable
                  className="collections-table mt-4"
                  minWidth="86rem"
                  columns={[
                    <Link key="tenant" href={paymentsHref(params, { sort: "tenant" })} className="sort-link">Tenant</Link>,
                    <Link key="property" href={paymentsHref(params, { sort: "property" })} className="sort-link">Property</Link>,
                    "Unit",
                    "Charge Type",
                    <Link key="amount" href={paymentsHref(params, { sort: "amount" })} className="sort-link">Amount Due</Link>,
                    "Late Fees",
                    "Due Date",
                    <Link key="daysLate" href={paymentsHref(params, { sort: "daysLate" })} className="sort-link">Days Late</Link>,
                    "Status",
                    "Actions"
                  ]}
                >
                  {collectionsRows.map((row) => {
                    const status = collectionStatus(row.payment);
                    return (
                      <tr key={row.payment.id} className="table-row">
                        <td className="table-cell">
                          <Link href={paymentsHref(params, { charge: row.payment.id })} className="table-link font-semibold">
                            {row.tenantLabel}
                            <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted)]">{row.primaryTenant?.email ?? row.lease?.tenantEmail ?? "No email"}</span>
                          </Link>
                        </td>
                        <td className="table-cell text-[var(--muted)]">{row.property?.name ?? "Unassigned"}</td>
                        <td className="table-cell font-medium">{row.unit ? `Unit ${row.unit.unitNumber}` : "No unit"}</td>
                        <td className="table-cell text-[var(--muted)]">{row.category}</td>
                        <td className="table-cell font-semibold">{formatCurrency(row.amountDue)}</td>
                        <td className="table-cell text-[var(--muted)]">{formatCurrency(row.payment.lateFeeAmount)}</td>
                        <td className="table-cell text-[var(--muted)]">{formatDate(row.payment.dueDate)}</td>
                        <td className="table-cell font-semibold">{row.daysLate ? row.daysLate : "-"}</td>
                        <td className="table-cell"><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td className="table-cell text-right">
                          <RowActionsMenu>
                            <RowActionLink href={`${paymentsHref(params, { create: "record", unitId: row.unit?.id, leaseId: row.lease?.id, tenantId: row.primaryTenant?.id })}#new-payment`}>Record Payment</RowActionLink>
                            <RowActionLink href={paymentsHref(params, { editPayment: row.payment.id, deletePayment: undefined, charge: undefined, payment: undefined, ledger: undefined })}>Edit Amount</RowActionLink>
                            <RowActionLink href={`/messages?q=${encodeURIComponent(row.tenantLabel)}`}>Send Reminder</RowActionLink>
                            {row.lease ? <RowActionLink href={`/leases/${row.lease.id}`}>View Lease</RowActionLink> : null}
                            <RowActionLink href={`/tenants?q=${encodeURIComponent(row.tenantLabel)}`}>View Tenant</RowActionLink>
                            <RowActionLink href={`${paymentsHref(params, { create: "charge", unitId: row.unit?.id, leaseId: row.lease?.id, tenantId: row.primaryTenant?.id })}#new-payment`}>Add Late Fee</RowActionLink>
                            <RowActionLink href={paymentsHref(params, { deletePayment: row.payment.id, editPayment: undefined, charge: undefined, payment: undefined, ledger: undefined })} destructive>Delete Payment</RowActionLink>
                          </RowActionsMenu>
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              ) : (
                <div className="mt-4">
                  <EmptyState title="No outstanding charges" description="Every scoped charge is paid or filtered out. Create a charge when there is a new balance to collect." />
                </div>
              )}
            </DetailSection>

            <DetailSection title="Collections Priority Queue" description="Highest-risk balances first.">
              <div className="priority-list">
                {priorityRows.length ? (
                  priorityRows.map((row) => (
                    <Link key={row.payment.id} href={paymentsHref(params, { charge: row.payment.id })} className="priority-item">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--text)]">{row.tenantLabel}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {row.daysLate ? `${row.daysLate} days overdue` : `Due ${formatDate(row.payment.dueDate)}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-semibold">{formatCurrency(row.amountDue)}</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">No collection follow-up needed right now.</p>
                )}
              </div>
            </DetailSection>
          </div>
        </>
      ) : null}

      {activeTab === "payments" ? (
        <>
          <section className="ops-grid">
            <StatCard label="Collected This Month" value={formatCurrency(monthPaid)} detail={`${paidRows.length} filtered records`} tone="success" />
            <StatCard label="Collected This Year" value={formatCurrency(collectedThisYear)} detail={`${currentYear} received payments`} tone="brand" />
            <StatCard label="Pending Stripe Transfers" value={String(pendingStripeTransferRows.length)} detail={formatCurrency(pendingStripeTransferRows.reduce((sum, row) => sum + row.amountPaid, 0))} tone={pendingStripeTransferRows.length ? "warning" : "success"} />
            <StatCard label="Average Collection Time" value={averageCollectionTime} detail="Paid date minus due date" />
          </section>

          <DetailSection title="Payment activity" description="Completed money movement only. No open balances or collection work here.">
            <form action="/transactions" className="finance-filter-bar">
              <input type="hidden" name="tab" value="payments" />
              <SearchInput defaultValue={params.q} placeholder="Search tenant, property, reference, or category" className="finance-filter-search" />
              <input name="dateFrom" type="date" defaultValue={dateFrom} className="field select-compact text-sm" aria-label="Date from" />
              <input name="dateTo" type="date" defaultValue={dateTo} className="field select-compact text-sm" aria-label="Date to" />
              <select name="propertyId" defaultValue={propertyFilter} className="field select-compact text-sm" aria-label="Property">
                <option value="all">All properties</option>
                {portal.scope.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
              <select name="tenantId" defaultValue={tenantFilter} className="field select-compact text-sm" aria-label="Tenant">
                <option value="all">All tenants</option>
                {portal.scope.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName}</option>)}
              </select>
              <select name="method" defaultValue={methodFilter} className="field select-compact text-sm" aria-label="Payment method">
                <option value="all">All methods</option>
                <option value="stripe">Stripe</option>
                <option value="manual">Manual</option>
              </select>
              <select name="category" defaultValue={categoryFilter} className="field select-compact text-sm" aria-label="Category">
                <option value="all">All categories</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <Button type="submit" variant="secondary" className="button-compact px-3">Apply</Button>
            </form>

            {paidRows.length ? (
              <DataTable
                className="money-table mt-4"
                minWidth="88rem"
                columns={[
                  "Date",
                  <Link key="tenant" href={paymentsHref(params, { sort: "tenant" })} className="sort-link">Tenant</Link>,
                  <Link key="property" href={paymentsHref(params, { sort: "property" })} className="sort-link">Property</Link>,
                  "Unit",
                  "Payment Method",
                  <Link key="amount" href={paymentsHref(params, { sort: "amount" })} className="sort-link">Amount</Link>,
                  <Link key="category" href={paymentsHref(params, { sort: "category" })} className="sort-link">Category</Link>,
                  "Status",
                  "Reference Number",
                  "Actions"
                ]}
              >
                {paidRows.map((row) => (
                  <tr key={row.payment.id} className="table-row">
                    <td className="table-cell">
                      <Link href={paymentsHref(params, { payment: row.payment.id })} className="table-link font-semibold">{formatDateOrUnset(row.paidAt)}</Link>
                    </td>
                    <td className="table-cell text-[var(--muted)]">{row.tenantLabel}</td>
                    <td className="table-cell text-[var(--muted)]">{row.property?.name ?? "Unassigned"}</td>
                    <td className="table-cell font-medium">{row.unit ? `Unit ${row.unit.unitNumber}` : "No unit"}</td>
                    <td className="table-cell text-[var(--muted)]">{row.method}</td>
                    <td className="table-cell font-semibold">{formatCurrency(row.amountPaid)}</td>
                    <td className="table-cell text-[var(--muted)]">{row.category}</td>
                    <td className="table-cell"><Badge tone="success">Paid</Badge></td>
                    <td className="table-cell font-mono text-xs text-[var(--muted)]">{referenceFor(row.payment)}</td>
                    <td className="table-cell text-right">
                      <RowActionsMenu>
                        <RowActionLink href={paymentsHref(params, { editPayment: row.payment.id, deletePayment: undefined, charge: undefined, payment: undefined, ledger: undefined })}>Edit Amount</RowActionLink>
                        <RowActionLink href={paymentsHref(params, { payment: row.payment.id, charge: undefined, ledger: undefined })}>View Details</RowActionLink>
                        <RowActionLink href={paymentsHref(params, { deletePayment: row.payment.id, editPayment: undefined, charge: undefined, payment: undefined, ledger: undefined })} destructive>Delete Payment</RowActionLink>
                      </RowActionsMenu>
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <div className="mt-4">
                <EmptyState title="No payment activity matches" description="Completed money movement will appear here after a Stripe checkout or manual payment record is marked paid." />
              </div>
            )}
          </DetailSection>

          {createMode === "import" ? (
            <DetailSection id="import-transactions" title="Import transactions" description="Bring external payment activity into Nexus for reconciliation.">
              <EmptyState
                title="Transaction import is ready for a connector"
                description="Use the export tools today. This placeholder keeps the workflow visible without mixing import setup into the collections queue."
                action={<Button variant="secondary" disabled><Upload className="h-4 w-4" /> Import CSV</Button>}
              />
            </DetailSection>
          ) : null}
        </>
      ) : null}

      {activeTab === "accounting" ? (
        <>
          <section className="ops-grid">
            <StatCard label="Rent Income YTD" value={formatCurrency(rentIncomeYtd)} detail={`${selectedYear} rental income`} tone="success" />
            <StatCard label="Deposits Held" value={formatCurrency(depositsHeld)} detail="Security deposit liability" tone="brand" />
            <StatCard label="Late Fees Collected" value={formatCurrency(lateFeesCollected)} detail="Fee income" tone="warning" />
            <StatCard label="Other Income" value={formatCurrency(otherIncome)} detail="Fees and reimbursements" />
          </section>

          <div className="payments-main-grid">
            <DetailSection
              title="Accounting ledger"
              description="Tax and bookkeeping view of paid income by category, property, and classification."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {[currentYear, currentYear - 1, currentYear - 2].map((year) => (
                    <Link key={year} href={paymentsHref(params, { tab: "accounting", year: String(year), ledger: undefined })} className={`rounded-md border px-2.5 py-2 text-xs font-semibold ${selectedYear === year ? "border-[var(--brand)] bg-[var(--accent-soft)] text-[var(--brand)]" : "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"}`}>
                      {year}
                    </Link>
                  ))}
                </div>
              }
            >
              <form action="/transactions" className="finance-filter-bar finance-filter-bar-accounting">
                <input type="hidden" name="tab" value="accounting" />
                <input type="hidden" name="year" value={String(selectedYear)} />
                <SearchInput defaultValue={params.q} placeholder="Search description, property, or category" className="finance-filter-search" />
                <select name="propertyId" defaultValue={propertyFilter} className="field select-compact text-sm" aria-label="Property">
                  <option value="all">All properties</option>
                  {portal.scope.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                </select>
                <select name="category" defaultValue={categoryFilter} className="field select-compact text-sm" aria-label="Category">
                  <option value="all">All categories</option>
                  {["Rent", "Deposit", "Late Fee", "Pet Fee", "Parking", "Utility Reimbursement", "Application Fee", "Other"].map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <Button type="submit" variant="secondary" className="button-compact px-3">Apply</Button>
              </form>
              {accountingRows.length ? (
                <DataTable
                  className="accounting-table mt-4"
                  minWidth="72rem"
                  columns={["Date", "Category", "Description", "Property", "Amount", "Tax Classification", "Actions"]}
                >
                  {accountingRows.map((row) => (
                    <tr key={row.payment.id} className="table-row">
                      <td className="table-cell">
                        <Link href={paymentsHref(params, { ledger: row.payment.id })} className="table-link font-semibold">{formatDateOrUnset(row.paidAt)}</Link>
                      </td>
                      <td className="table-cell"><Badge tone={row.category === "Deposit" ? "warning" : "default"}>{row.category}</Badge></td>
                      <td className="table-cell text-[var(--muted)]">{row.payment.description}</td>
                      <td className="table-cell text-[var(--muted)]">{row.property?.name ?? "Unassigned"}</td>
                      <td className="table-cell font-semibold">{formatCurrency(row.amountPaid)}</td>
                      <td className="table-cell text-[var(--muted)]">{row.taxClassification}</td>
                      <td className="table-cell text-right">
                        <RowActionsMenu>
                          <RowActionLink href={paymentsHref(params, { editPayment: row.payment.id, deletePayment: undefined, charge: undefined, payment: undefined, ledger: undefined })}>Edit Amount</RowActionLink>
                          <RowActionLink href={paymentsHref(params, { ledger: row.payment.id, charge: undefined, payment: undefined })}>View Ledger</RowActionLink>
                          <RowActionLink href={paymentsHref(params, { deletePayment: row.payment.id, editPayment: undefined, charge: undefined, payment: undefined, ledger: undefined })} destructive>Delete Payment</RowActionLink>
                        </RowActionsMenu>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              ) : (
                <div className="mt-4">
                  <EmptyState title="No accounting records match" description="Paid income for the selected year and filters will appear here." />
                </div>
              )}
            </DetailSection>

            <DetailSection title="Exports" description="Download clean financial files for bookkeeping and tax preparation.">
              <div className="grid gap-2">
                <Link href={`/api/export/financials?format=csv&year=${selectedYear}`} className="export-action">
                  <Download className="h-4 w-4" />
                  Export CSV
                </Link>
                <Link href={`/api/export/financials?format=xlsx&year=${selectedYear}`} className="export-action">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel
                </Link>
                <Link href={`/api/export/financials?format=csv&report=tax&year=${selectedYear}`} className="export-action">
                  <CalendarClock className="h-4 w-4" />
                  Export Tax Report
                </Link>
              </div>
            </DetailSection>
          </div>
        </>
      ) : null}

      {createMode && createMode !== "import" ? (
        <DetailSection
          id="new-payment"
          title={createMode === "record" ? "Record payment" : createMode === "request" ? "Send payment request" : "Create charge"}
          description="Create one clean ledger item. Paid records flow to Payments and Accounting; open charges flow to Collections."
        >
          {portal.scope.units.length && portal.scope.tenants.length ? (
            <form action={createPaymentAction} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <select name="unitId" defaultValue={selectedUnitId} className="field" required>
                  <option value="" disabled>Select unit</option>
                  {portal.scope.units.map((unit) => {
                    const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                    return <option key={unit.id} value={unit.id}>{property?.name} - Unit {unit.unitNumber}</option>;
                  })}
                </select>
                <select name="leaseId" defaultValue={selectedLeaseId} className="field">
                  <option value="">Auto-link active lease for unit</option>
                  {portal.scope.leases.map((lease) => {
                    const unit = portal.scope.units.find((item) => item.id === lease.unitId);
                    const tenant = portal.scope.tenants.find((item) => lease.tenantIds.includes(item.id));
                    return (
                      <option key={lease.id} value={lease.id}>
                        {lease.nexusLeaseId ?? lease.id} - Unit {unit?.unitNumber ?? "unassigned"} {tenant ? `- ${tenant.firstName} ${tenant.lastName}` : ""}
                      </option>
                    );
                  })}
                </select>
                <select name="tenantId" defaultValue={selectedTenantId} className="field" required>
                  <option value="" disabled>Select tenant</option>
                  {portal.scope.tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.lastName}, {tenant.firstName}{tenant.email ? ` - ${tenant.email}` : ""}
                    </option>
                  ))}
                </select>
                <input name="description" placeholder={createMode === "charge" ? "Charge description" : "Payment description"} className="field" required />
                <select name="categoryTag" defaultValue={createMode === "charge" ? "Rent" : "Rent"} className="field">
                  {["Rent", "Deposit", "Late Fee", "Pet Fee", "Parking", "Utility Reimbursement", "Application Fee", "Other"].map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-4">
                <div className="form-grid-2">
                  <input name="amount" type="number" step="0.01" placeholder="Amount" className="field" required />
                  <input name="dueDate" type="date" className="field" required />
                </div>
                <div className="form-grid-2">
                  <input name="paidDate" type="date" className="field" />
                  <select name="status" className="field" defaultValue={createMode === "record" ? "PAID" : "PENDING"}>
                    <option value="PENDING">Pending</option>
                    <option value="PAID">Paid</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="LATE">Late</option>
                  </select>
                </div>
                <div className="form-grid-2">
                  <input name="lateFeeAmount" type="number" step="0.01" placeholder="Late fee" className="field" />
                  <input name="balanceDue" type="number" step="0.01" placeholder="Balance due" className="field" />
                </div>
                <SubmitButton>
                  <Send className="h-4 w-4" />
                  {createMode === "record" ? "Record payment" : createMode === "request" ? "Send request" : "Create charge"}
                </SubmitButton>
              </div>
            </form>
          ) : (
            <EmptyState
              title={portal.scope.units.length ? "Create a tenant before adding financial activity" : "Create a unit before adding financial activity"}
              description="Nexus links every charge and payment to a tenant, unit, property, and lease context when available."
            />
          )}
        </DetailSection>
      ) : null}

      {selectedEditPayment ? (
        <aside className="workflow-drawer" aria-label="Edit payment drawer">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Edit Payment</p>
              <h2 className="mt-1 truncate text-lg font-semibold">{selectedEditPayment.tenantLabel}</h2>
            </div>
            <Link href={paymentMutationReturnHref} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)]">Close</Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-grid">
              <div><span>Description</span><strong>{selectedEditPayment.payment.description}</strong></div>
              <div><span>Status</span><strong>{selectedEditPayment.payment.status}</strong></div>
              <div><span>Unit</span><strong>{selectedEditPayment.unit?.unitNumber ?? "No unit"}</strong></div>
              <div><span>Reference</span><strong>{referenceFor(selectedEditPayment.payment)}</strong></div>
            </div>
            <form action={updatePaymentAction} className="space-y-4">
              <input type="hidden" name="paymentId" value={selectedEditPayment.payment.id} />
              <input type="hidden" name="returnTo" value={paymentMutationReturnHref} />
              <label className="block space-y-2 text-sm font-semibold text-[var(--text)]">
                <span>Amount</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={String(selectedEditPayment.payment.status === "PAID" ? selectedEditPayment.amountPaid : selectedEditPayment.payment.amount)}
                  className="field"
                  required
                />
              </label>
              <SubmitButton pendingLabel="Updating payment...">Update Payment</SubmitButton>
            </form>
          </div>
        </aside>
      ) : null}

      {selectedDeletePayment ? (
        <aside className="workflow-drawer" aria-label="Delete payment drawer">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Delete Payment</p>
              <h2 className="mt-1 truncate text-lg font-semibold">{selectedDeletePayment.tenantLabel}</h2>
            </div>
            <Link href={paymentMutationReturnHref} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)]">Close</Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-total">
              <span>{selectedDeletePayment.payment.description}</span>
              <strong>{formatCurrency(selectedDeletePayment.payment.status === "PAID" ? selectedDeletePayment.amountPaid : selectedDeletePayment.amountDue)}</strong>
            </div>
            <form action={deletePaymentAction} className="space-y-4">
              <input type="hidden" name="paymentId" value={selectedDeletePayment.payment.id} />
              <input type="hidden" name="returnTo" value={paymentMutationReturnHref} />
              <label className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                <input type="checkbox" name="confirmDelete" value="yes" required className="mt-1 h-4 w-4 rounded border-red-300" />
                <span>Delete this payment record permanently.</span>
              </label>
              <SubmitButton variant="danger" pendingLabel="Deleting payment...">Delete Payment</SubmitButton>
            </form>
          </div>
        </aside>
      ) : null}

      {selectedCollection ? (
        <aside className="workflow-drawer" aria-label="Collections detail drawer">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Collections Detail</p>
              <h2 className="mt-1 truncate text-lg font-semibold">{selectedCollection.tenantLabel}</h2>
            </div>
            <Link href={paymentsHref(params, { charge: undefined })} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)]">Close</Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-total">
              <span>Balance due</span>
              <strong>{formatCurrency(selectedCollection.amountDue)}</strong>
            </div>
            <div className="drawer-grid">
              <div><span>Lease</span><strong>{selectedCollection.lease?.nexusLeaseId ?? selectedCollection.lease?.id ?? "No lease"}</strong></div>
              <div><span>Unit</span><strong>{selectedCollection.unit?.unitNumber ?? "No unit"}</strong></div>
              <div><span>Due date</span><strong>{formatDate(selectedCollection.payment.dueDate)}</strong></div>
              <div><span>Days late</span><strong>{selectedCollection.daysLate || 0}</strong></div>
            </div>
            <DetailSection title="Balance breakdown">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Original charge</span><strong>{formatCurrency(selectedCollection.payment.amount)}</strong></div>
                <div className="flex justify-between"><span>Late fees</span><strong>{formatCurrency(selectedCollection.payment.lateFeeAmount)}</strong></div>
                <div className="flex justify-between"><span>Open balance</span><strong>{formatCurrency(selectedCollection.amountDue)}</strong></div>
              </div>
            </DetailSection>
            <DetailSection title="Payment history">
              <div className="space-y-2">
                {rows.filter((row) =>
                  row.payment.status === "PAID" &&
                  row.lease?.id === selectedCollection.lease?.id &&
                  (!selectedCollection.primaryTenant || row.primaryTenant?.id === selectedCollection.primaryTenant.id)
                ).slice(0, 4).map((row) => (
                  <div key={row.payment.id} className="flex justify-between rounded-md border border-[var(--line)] px-3 py-2 text-sm">
                    <span>{formatDateOrUnset(row.paidAt)}</span>
                    <strong>{formatCurrency(row.amountPaid)}</strong>
                  </div>
                ))}
                {!rows.some((row) =>
                  row.payment.status === "PAID" &&
                  row.lease?.id === selectedCollection.lease?.id &&
                  (!selectedCollection.primaryTenant || row.primaryTenant?.id === selectedCollection.primaryTenant.id)
                ) ? (
                  <p className="text-sm text-[var(--muted)]">No linked paid history for this lease yet.</p>
                ) : null}
              </div>
            </DetailSection>
            <DetailSection title="Notes and communication">
              <div className="space-y-2 text-sm text-[var(--muted)]">
                <p>{selectedCollection.payment.description}</p>
                <p>Last system activity: {formatDate(selectedCollection.payment.updatedAt)}</p>
              </div>
            </DetailSection>
            <DetailSection title="Collection actions">
              <div className="grid gap-2">
                <Link href={`${paymentsHref(params, { create: "record", unitId: selectedCollection.unit?.id, leaseId: selectedCollection.lease?.id, tenantId: selectedCollection.primaryTenant?.id })}#new-payment`} className="export-action">Record Payment</Link>
                <Link href={paymentsHref(params, { editPayment: selectedCollection.payment.id, deletePayment: undefined, charge: undefined })} className="export-action">Edit Amount</Link>
                <Link href={`/messages?q=${encodeURIComponent(selectedCollection.tenantLabel)}`} className="export-action">Send Reminder</Link>
                {selectedCollection.lease ? <Link href={`/leases/${selectedCollection.lease.id}`} className="export-action">View Lease</Link> : null}
                <Link href={`/tenants?q=${encodeURIComponent(selectedCollection.tenantLabel)}`} className="export-action">View Tenant</Link>
                <Link href={paymentsHref(params, { deletePayment: selectedCollection.payment.id, editPayment: undefined, charge: undefined })} className="export-action text-red-700">Delete Payment</Link>
              </div>
            </DetailSection>
          </div>
        </aside>
      ) : null}

      {selectedPayment ? (
        <aside className="workflow-drawer" aria-label="Payment detail drawer">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Payment Details</p>
              <h2 className="mt-1 truncate text-lg font-semibold">{formatCurrency(selectedPayment.amountPaid)}</h2>
            </div>
            <Link href={paymentsHref(params, { payment: undefined })} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)]">Close</Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-grid">
              <div><span>Date</span><strong>{formatDateOrUnset(selectedPayment.paidAt)}</strong></div>
              <div><span>Method</span><strong>{selectedPayment.method}</strong></div>
              <div><span>Reference</span><strong>{referenceFor(selectedPayment.payment)}</strong></div>
              <div><span>Tax category</span><strong>{selectedPayment.category}</strong></div>
            </div>
            <DetailSection title="Linked lease">
              <p className="text-sm text-[var(--muted)]">{selectedPayment.lease?.nexusLeaseId ?? selectedPayment.lease?.id ?? "No linked lease"}</p>
            </DetailSection>
            <DetailSection title="Stripe transaction">
              <p className="break-all font-mono text-xs text-[var(--muted)]">{selectedPayment.payment.stripePaymentIntentId ?? selectedPayment.payment.stripeCheckoutSessionId ?? "Manual payment"}</p>
            </DetailSection>
            <DetailSection title="Notes">
              <p className="text-sm text-[var(--muted)]">{selectedPayment.payment.description}</p>
            </DetailSection>
            <DetailSection title="Actions">
              <div className="grid gap-2">
                <Link href={paymentsHref(params, { editPayment: selectedPayment.payment.id, deletePayment: undefined, payment: undefined })} className="export-action">Edit Amount</Link>
                <Link href={paymentsHref(params, { deletePayment: selectedPayment.payment.id, editPayment: undefined, payment: undefined })} className="export-action text-red-700">Delete Payment</Link>
              </div>
            </DetailSection>
          </div>
        </aside>
      ) : null}

      {selectedLedger ? (
        <aside className="workflow-drawer" aria-label="Accounting detail drawer">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Accounting Record</p>
              <h2 className="mt-1 truncate text-lg font-semibold">{selectedLedger.category}</h2>
            </div>
            <Link href={paymentsHref(params, { ledger: undefined })} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)]">Close</Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-total">
              <span>{selectedLedger.taxClassification}</span>
              <strong>{formatCurrency(selectedLedger.amountPaid)}</strong>
            </div>
            <div className="drawer-grid">
              <div><span>Date</span><strong>{formatDateOrUnset(selectedLedger.paidAt)}</strong></div>
              <div><span>Property</span><strong>{selectedLedger.property?.name ?? "Unassigned"}</strong></div>
              <div><span>Unit</span><strong>{selectedLedger.unit?.unitNumber ?? "No unit"}</strong></div>
              <div><span>Reference</span><strong>{referenceFor(selectedLedger.payment)}</strong></div>
            </div>
            <DetailSection title="Actions">
              <div className="grid gap-2">
                <Link href={paymentsHref(params, { editPayment: selectedLedger.payment.id, deletePayment: undefined, ledger: undefined })} className="export-action">Edit Amount</Link>
                <Link href={paymentsHref(params, { deletePayment: selectedLedger.payment.id, editPayment: undefined, ledger: undefined })} className="export-action text-red-700">Delete Payment</Link>
              </div>
            </DetailSection>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
