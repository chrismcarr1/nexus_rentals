import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  ShieldCheck,
  TrendingUp,
  Upload,
  X
} from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PaymentCalendar } from "@/components/payment-calendar";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { SearchInput } from "@/components/search-input";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createBundledStripeCheckoutAction,
  createPaymentAction,
  createStripeCheckoutAction,
  deletePaymentAction,
  updatePaymentAction
} from "@/lib/actions";
import {
  addDaysToDateKey,
  appDateIsAfter,
  appDateIsBefore,
  appDateKeyFromValue,
  differenceInAppCalendarDays,
  getAppDateKey,
  getAppYear,
  monthKeyFromValue
} from "@/lib/app-time";
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

function stripeAlertTone(status?: string): "success" | "warning" | "error" | null {
  if (!status) return null;
  if (status === "success" || status === "payment-linked" || status === "payment-unlinked") return "success";
  if (status === "cancelled") return "warning";
  return "error";
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
  const today = getAppDateKey();
  const daysLate = differenceInAppCalendarDays(today, payment.dueDate);
  const daysUntilDue = differenceInAppCalendarDays(payment.dueDate, today);

  if (payment.status === "PARTIAL") return { label: "Partial", tone: "warning" as const };
  if (daysLate >= 30) return { label: "Severely Late", tone: "danger" as const };
  if (daysLate > 0 || payment.status === "LATE") return { label: "Late", tone: "danger" as const };
  if (daysUntilDue <= 7) return { label: "Due Soon", tone: "warning" as const };
  return { label: "Pending", tone: "default" as const };
}

function withinYear(value: string | undefined, year: number) {
  if (!value) return false;
  return appDateKeyFromValue(value).startsWith(`${year}-`);
}

export default async function TransactionsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const portal = await getPortalContext(user);
  const stripeMessage =
    stripeStatusMessage(params.stripe) ??
    (params.error === "invalid-payment"
      ? "Review the charge details. Unit, description, amount, due date, and status are required."
      : null);
  const alertTone = stripeAlertTone(params.stripe) ?? (params.error === "invalid-payment" ? "warning" : null);

  /* ── TENANT VIEW ──────────────────────────────────────────── */
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

    const outstandingPayments = tenantPaymentHistory.filter((p) => p.status !== "PAID");
    const totalOutstanding = outstandingPayments.reduce((sum, p) => sum + (p.balanceDue || p.amount), 0);
    const canBundlePay = outstandingPayments.length > 1;

    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Rent & Fees"
          title="Payments"
          description="View your current balance, pay securely through Stripe, and review your complete payment history."
        />

        {stripeMessage && alertTone ? (
          <div className={`page-alert page-alert-${alertTone}`}>{stripeMessage}</div>
        ) : null}

        {/* Balance hero — dark gradient top / light form bottom */}
        {outstandingPayments.length > 0 ? (
          <Card className="pay-hero">
            <div className="pay-hero-balance">
              <div className="pay-hero-top">
                <div className="min-w-0">
                  <p className="pay-hero-eyebrow">Balance due</p>
                  <p className="pay-hero-amount">{formatCurrency(totalOutstanding)}</p>
                  <p className="pay-hero-meta">
                    {outstandingPayments.length > 1
                      ? `${outstandingPayments.length} outstanding charges`
                      : `Due ${formatDate(outstandingPayments[0].dueDate)}`}
                  </p>
                </div>
                <div className="pay-hero-icon">
                  <CreditCard className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="pay-hero-form">
              {canBundlePay ? (
                <form action={createBundledStripeCheckoutAction} className="pay-bundle-form">
                  <p className="pay-bundle-label">Select charges to pay</p>
                  <div className="bundled-payment-select">
                    {outstandingPayments.map((payment) => (
                      <label key={payment.id} className="bundled-payment-item">
                        <input type="checkbox" name="paymentId" value={payment.id} defaultChecked />
                        <div className="bundled-payment-label">
                          <span className="bundled-payment-name">{payment.description}</span>
                          <span className="bundled-payment-meta">Due {formatDate(payment.dueDate)}</span>
                        </div>
                        <span className="bundled-payment-amount">{formatCurrency(balanceFor(payment))}</span>
                      </label>
                    ))}
                  </div>
                  <SubmitButton className="w-full justify-center" pendingLabel="Opening Stripe…">
                    <CreditCard className="h-4 w-4" />
                    Pay selected with Stripe
                  </SubmitButton>
                </form>
              ) : (
                <form action={createStripeCheckoutAction}>
                  <input type="hidden" name="paymentId" value={outstandingPayments[0].id} />
                  <SubmitButton className="w-full justify-center" pendingLabel="Opening Stripe…">
                    <CreditCard className="h-4 w-4" />
                    Pay {formatCurrency(balanceFor(outstandingPayments[0]))} with Stripe
                  </SubmitButton>
                </form>
              )}
              <p className="pay-hero-security">
                <LockKeyhole className="h-3.5 w-3.5" />
                Secured by Stripe — card details never reach Nexus Rentals
              </p>
            </div>
          </Card>
        ) : (
          <div className="pay-hero-clear-card">
            <div className="pay-hero-icon-clear">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-[var(--text)]">All caught up</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">No outstanding charges on your account.</p>
            </div>
          </div>
        )}

        {/* Payment history */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">History</p>
              <h2 className="mt-1 text-base font-semibold text-[var(--text)]">Payment history</h2>
            </div>
            <Badge tone="default">{tenantPaymentHistory.length} records</Badge>
          </div>
          <div className="p-5">
            {tenantPaymentHistory.length ? (
              <DataTable
                className="tenant-history-table"
                columns={["Description", "Due date", "Status", "Amount", "Reference", ""]}
                minWidth="0"
              >
                {tenantPaymentHistory.map((payment) => (
                  <tr key={payment.id} className="table-row">
                    <td className="table-cell font-semibold">{payment.description}</td>
                    <td className="table-cell text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                    <td className="table-cell">
                      <Badge tone={badgeToneFromPayment(payment.status)}>{payment.status}</Badge>
                    </td>
                    <td className="table-cell font-semibold tabular-nums">
                      {formatCurrency(payment.status === "PAID" ? paidAmountFor(payment) : balanceFor(payment))}
                    </td>
                    <td className="table-cell font-mono text-xs text-[var(--muted)]">{referenceFor(payment)}</td>
                    <td className="table-cell text-right">
                      {payment.status !== "PAID" ? (
                        <form action={createStripeCheckoutAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <SubmitButton pendingLabel="Opening…" className="button-compact gap-1.5 px-3">
                            <CreditCard className="h-3.5 w-3.5" />
                            Pay
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <EmptyState
                icon={ReceiptText}
                title="No payment history yet"
                description="Charges and payments linked to your lease will appear here once your manager creates them."
              />
            )}
          </div>
        </Card>

        <PaymentCalendar events={portal.calendar} defaultCollapsed={false} />
      </div>
    );
  }

  /* ── MANAGER / ADMIN VIEW ─────────────────────────────────── */
  const activeTab: PaymentsTab = params.tab === "payments" || params.tab === "accounting" ? params.tab : "collections";
  const today = getAppDateKey();
  const next30 = addDaysToDateKey(today, 30);
  const currentYear = getAppYear();
  const currentMonthKey = today.slice(0, 7);
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
    const daysLate = Math.max(0, differenceInAppCalendarDays(today, payment.dueDate));
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
      const paidDateKey = appDateKeyFromValue(row.paidAt);
      if (query && !row.searchText.includes(query)) return false;
      if (propertyFilter !== "all" && row.property?.id !== propertyFilter) return false;
      if (tenantFilter !== "all" && !row.tenants.some((tenant) => tenant.id === tenantFilter)) return false;
      if (methodFilter !== "all" && row.method.toLowerCase() !== methodFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (dateFrom && paidDateKey && paidDateKey < dateFrom) return false;
      if (dateTo && paidDateKey && paidDateKey > dateTo) return false;
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
    .map((row) => ({ ...row, taxClassification: taxClassification(row.category) }))
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));

  const outstandingBalance = rows.filter((row) => row.payment.status !== "PAID").reduce((sum, row) => sum + row.amountDue, 0);
  const overdueRows = rows.filter((row) => row.payment.status !== "PAID" && (row.daysLate > 0 || row.payment.status === "LATE"));
  const overdueBalance = overdueRows.reduce((sum, row) => sum + row.amountDue, 0);
  const upcomingBalance = rows
    .filter((row) => row.payment.status !== "PAID" && appDateIsAfter(row.payment.dueDate, today) && appDateIsBefore(row.payment.dueDate, next30))
    .reduce((sum, row) => sum + row.amountDue, 0);
  const monthPaid = rows
    .filter((row) => row.payment.status === "PAID" && row.paidAt && monthKeyFromValue(row.paidAt) === currentMonthKey)
    .reduce((sum, row) => sum + row.amountPaid, 0);
  const monthDue = rows
    .filter((row) => monthKeyFromValue(row.payment.dueDate) === currentMonthKey)
    .reduce((sum, row) => sum + row.payment.amount, 0);
  const collectionRate = monthDue ? Math.round((monthPaid / monthDue) * 100) : 100;
  const collectedThisYear = rows
    .filter((row) => row.payment.status === "PAID" && row.paidAt && appDateKeyFromValue(row.paidAt).startsWith(`${currentYear}-`))
    .reduce((sum, row) => sum + row.amountPaid, 0);
  const pendingStripeTransferRows = rows.filter(
    (row) => row.payment.status === "PAID" && row.method === "Stripe" && !row.payment.stripeDestinationAccountId
  );
  const averageCollectionTime = (() => {
    const completed = rows.filter((row) => row.payment.status === "PAID" && row.paidAt);
    if (!completed.length) return "0 days";
    const average = completed.reduce((sum, row) => sum + differenceInAppCalendarDays(row.paidAt!, row.payment.dueDate), 0) / completed.length;
    return `${Math.max(0, Math.round(average))} days`;
  })();
  const rentIncomeYtd = accountingRows.filter((row) => row.category === "Rent").reduce((sum, row) => sum + row.amountPaid, 0);
  const depositsHeld = accountingRows.filter((row) => row.category === "Deposit").reduce((sum, row) => sum + row.amountPaid, 0);
  const lateFeesCollected = accountingRows.filter((row) => row.category === "Late Fee").reduce((sum, row) => sum + row.amountPaid, 0);
  const otherIncome = accountingRows
    .filter((row) => row.category !== "Rent" && row.category !== "Deposit" && row.category !== "Late Fee")
    .reduce((sum, row) => sum + row.amountPaid, 0);

  const categoryOptions = Array.from(new Set(rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b));
  const selectedCollection = rows.find((row) => row.payment.id === params.charge && row.payment.status !== "PAID");
  const selectedPayment = rows.find((row) => row.payment.id === params.payment && row.payment.status === "PAID");
  const selectedLedger = accountingRows.find((row) => row.payment.id === params.ledger);
  const selectedEditPayment = rows.find((row) => row.payment.id === params.editPayment);
  const selectedDeletePayment = rows.find((row) => row.payment.id === params.deletePayment);
  const paymentMutationReturnHref = paymentsHref(params, { editPayment: undefined, deletePayment: undefined });
  const hasOpenDrawer = !!(selectedCollection || selectedPayment || selectedLedger || selectedEditPayment || selectedDeletePayment);
  const closeAllDrawers = paymentsHref(params, { charge: undefined, payment: undefined, ledger: undefined, editPayment: undefined, deletePayment: undefined });

  return (
    <div className="payments-workflow space-y-5">
      <PageHeader
        eyebrow="Financial operations"
        title="Payments"
        description="Track collections, record payments, and export bookkeeping data across all leases."
        actions={
          <details className="new-action-menu relative">
            <summary className="new-action-trigger">
              <Plus className="h-4 w-4" />
              New
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </summary>
            <div className="new-action-panel">
              <Link href={`${paymentsHref(params, { create: "record", tab: "payments" })}#new-payment`} className="new-action-item">
                Record Payment
              </Link>
              <Link href={`${paymentsHref(params, { create: "charge", tab: undefined })}#new-payment`} className="new-action-item">
                Create Charge
              </Link>
              <Link href={`${paymentsHref(params, { create: "request", tab: undefined })}#new-payment`} className="new-action-item">
                Send Payment Request
              </Link>
              <Link href={`${paymentsHref(params, { create: "import", tab: "payments" })}#import-transactions`} className="new-action-item">
                Import Transactions
              </Link>
            </div>
          </details>
        }
      />

      {stripeMessage && alertTone ? (
        <div className={`page-alert page-alert-${alertTone}`}>{stripeMessage}</div>
      ) : null}

      {/* ── Financial pulse bar — always visible, tabs-independent KPIs ── */}
      <div className="payments-pulse">
        <div className={`pulse-metric ${outstandingBalance > 0 ? "pulse-warning" : "pulse-success"}`}>
          <p className="pulse-label">Outstanding</p>
          <p className="pulse-value">{formatCurrency(outstandingBalance)}</p>
          <p className="pulse-detail">{rows.filter((row) => row.payment.status !== "PAID").length} open charges</p>
        </div>
        <div className={`pulse-metric ${overdueBalance > 0 ? "pulse-danger" : "pulse-success"}`}>
          <p className="pulse-label">Overdue</p>
          <p className="pulse-value">{formatCurrency(overdueBalance)}</p>
          <p className="pulse-detail">{overdueRows.length} need follow-up</p>
        </div>
        <div className="pulse-metric pulse-success">
          <p className="pulse-label">Collected YTD</p>
          <p className="pulse-value">{formatCurrency(collectedThisYear)}</p>
          <p className="pulse-detail">{currentYear} received</p>
        </div>
        <div className={`pulse-metric ${collectionRate >= 95 ? "pulse-success" : collectionRate >= 75 ? "pulse-warning" : "pulse-danger"}`}>
          <p className="pulse-label">Collection rate</p>
          <p className="pulse-value">{collectionRate}%</p>
          <p className="pulse-detail">{formatCurrency(monthPaid)} this month</p>
        </div>
      </div>

      {/* ── Tab nav with integrated Stripe status ── */}
      <div className="payments-tab-bar">
        <nav className="payments-tabs" aria-label="Payments sections">
          <Link
            href={tabHref(params, "collections")}
            className={`payments-tab ${activeTab === "collections" ? "payments-tab-active" : ""}`}
          >
            <Banknote className="h-4 w-4" />
            Collections
            <span>{rows.filter((row) => row.payment.status !== "PAID").length}</span>
          </Link>
          <Link
            href={tabHref(params, "payments")}
            className={`payments-tab ${activeTab === "payments" ? "payments-tab-active" : ""}`}
          >
            <ReceiptText className="h-4 w-4" />
            Payments
            <span>{rows.filter((row) => row.payment.status === "PAID").length}</span>
          </Link>
          <Link
            href={tabHref(params, "accounting")}
            className={`payments-tab ${activeTab === "accounting" ? "payments-tab-active" : ""}`}
          >
            <BookOpenCheck className="h-4 w-4" />
            Accounting
            <span>{selectedYear}</span>
          </Link>
        </nav>
        <div className="payments-tab-actions">
          <Link
            href="/settings#payments-stripe"
            className={`stripe-status-pill ${managerPaymentsReady ? "stripe-ready" : "stripe-pending"}`}
          >
            {managerPaymentsReady ? <ShieldCheck className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
            {managerPaymentsReady ? "Stripe live" : managerConnectState.label}
          </Link>
        </div>
      </div>

      {/* ── COLLECTIONS TAB ── */}
      {activeTab === "collections" ? (
        <DetailSection
          title="Outstanding charges"
          description="Every unpaid balance sorted for daily collection work. Click a row to open the collection drawer."
          actions={
            <div className="flex items-center gap-2">
              {upcomingBalance > 0 ? (
                <span className="text-xs text-[var(--muted)]">
                  <span className="font-semibold text-[var(--text)]">{formatCurrency(upcomingBalance)}</span> due in 30 days
                </span>
              ) : null}
              <Badge tone={collectionsRows.length ? "warning" : "success"}>{collectionsRows.length} open</Badge>
            </div>
          }
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
              minWidth="0"
              columns={[
                <Link key="tenant" href={paymentsHref(params, { sort: "tenant" })} className="sort-link">Tenant</Link>,
                <Link key="property" href={paymentsHref(params, { sort: "property" })} className="sort-link">Location</Link>,
                <Link key="amount" href={paymentsHref(params, { sort: "amount" })} className="sort-link">Amount due</Link>,
                "Due date",
                <Link key="daysLate" href={paymentsHref(params, { sort: "daysLate" })} className="sort-link">Days late</Link>,
                "Status",
                "Quick action",
                ""
              ]}
            >
              {collectionsRows.map((row) => {
                const status = collectionStatus(row.payment);
                const isLate = row.daysLate > 0 || row.payment.status === "LATE";
                return (
                  <tr key={row.payment.id} className={`table-row ${isLate ? "row-late" : ""}`}>
                    <td className="table-cell" style={{ position: "relative" }}>
                      <Link href={paymentsHref(params, { charge: row.payment.id })} className="table-link font-semibold">
                        {row.tenantLabel}
                        <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted)]">
                          {row.primaryTenant?.email ?? row.lease?.tenantEmail ?? row.payment.description}
                        </span>
                      </Link>
                    </td>
                    <td className="table-cell">
                      <span className="font-medium text-[var(--text)]">{row.property?.name ?? "Unassigned"}</span>
                      {row.unit ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">Unit {row.unit.unitNumber}</span>
                      ) : null}
                    </td>
                    <td className="table-cell">
                      <span className="font-semibold tabular-nums">{formatCurrency(row.amountDue)}</span>
                      {row.payment.lateFeeAmount ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">+{formatCurrency(row.payment.lateFeeAmount)} late fee</span>
                      ) : null}
                    </td>
                    <td className="table-cell text-[var(--muted)]">{formatDate(row.payment.dueDate)}</td>
                    <td className="table-cell">
                      {row.daysLate ? (
                        <span className="font-semibold text-red-600">{row.daysLate}</span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="table-cell"><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td className="table-cell">
                      <Link
                        href={`${paymentsHref(params, { create: "record", unitId: row.unit?.id, leaseId: row.lease?.id, tenantId: row.primaryTenant?.id })}#new-payment`}
                        className="record-btn"
                      >
                        <Pencil className="h-3 w-3" />
                        Record
                      </Link>
                    </td>
                    <td className="table-cell text-right">
                      <RowActionsMenu>
                        <RowActionLink href={`${paymentsHref(params, { create: "record", unitId: row.unit?.id, leaseId: row.lease?.id, tenantId: row.primaryTenant?.id })}#new-payment`}>Record Payment</RowActionLink>
                        <RowActionLink href={paymentsHref(params, { editPayment: row.payment.id, deletePayment: undefined, charge: undefined, payment: undefined, ledger: undefined })}>Edit Amount</RowActionLink>
                        <RowActionLink href={`/messages?q=${encodeURIComponent(row.tenantLabel)}`}>Send Reminder</RowActionLink>
                        {row.lease ? <RowActionLink href={`/leases/${row.lease.id}`}>View Lease</RowActionLink> : null}
                        <RowActionLink href={`/tenants?q=${encodeURIComponent(row.tenantLabel)}`}>View Tenant</RowActionLink>
                        <RowActionLink href={`${paymentsHref(params, { create: "charge", unitId: row.unit?.id, leaseId: row.lease?.id, tenantId: row.primaryTenant?.id })}#new-payment`}>Add Late Fee</RowActionLink>
                        <RowActionLink href={paymentsHref(params, { deletePayment: row.payment.id, editPayment: undefined, charge: undefined, payment: undefined, ledger: undefined })} destructive>Delete</RowActionLink>
                      </RowActionsMenu>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={CheckCircle2}
                title="No outstanding charges"
                description="Every scoped charge is paid or filtered out. Create a charge when a new balance needs collecting."
              />
            </div>
          )}
        </DetailSection>
      ) : null}

      {/* ── PAYMENTS TAB ── */}
      {activeTab === "payments" ? (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Collected this month" value={formatCurrency(monthPaid)} detail={`${paidRows.length} filtered records`} tone="success" />
            <StatCard label="Collected YTD" value={formatCurrency(collectedThisYear)} detail={`${currentYear} received`} tone="brand" />
            <StatCard
              label="Avg collection time"
              value={averageCollectionTime}
              detail={pendingStripeTransferRows.length ? `${pendingStripeTransferRows.length} pending Stripe transfers` : "Paid date minus due date"}
              tone={pendingStripeTransferRows.length ? "warning" : "default"}
            />
          </section>

          <DetailSection title="Payment activity" description="Completed money movement — every collected charge with date, method, and reference.">
            <form action="/transactions" className="finance-filter-bar">
              <input type="hidden" name="tab" value="payments" />
              <SearchInput defaultValue={params.q} placeholder="Search tenant, property, reference, or category" className="finance-filter-search" />
              <input name="dateFrom" type="date" defaultValue={dateFrom} className="field select-compact text-sm" aria-label="Date from" />
              <input name="dateTo" type="date" defaultValue={dateTo} className="field select-compact text-sm" aria-label="Date to" />
              <select name="propertyId" defaultValue={propertyFilter} className="field select-compact text-sm" aria-label="Property">
                <option value="all">All properties</option>
                {portal.scope.properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
              <select name="tenantId" defaultValue={tenantFilter} className="field select-compact text-sm" aria-label="Tenant">
                <option value="all">All tenants</option>
                {portal.scope.tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName}</option>
                ))}
              </select>
              <select name="method" defaultValue={methodFilter} className="field select-compact text-sm" aria-label="Method">
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
                minWidth="0"
                columns={[
                  "Date paid",
                  <Link key="tenant" href={paymentsHref(params, { sort: "tenant" })} className="sort-link">Tenant</Link>,
                  <Link key="property" href={paymentsHref(params, { sort: "property" })} className="sort-link">Location</Link>,
                  "Method",
                  <Link key="amount" href={paymentsHref(params, { sort: "amount" })} className="sort-link">Amount</Link>,
                  <Link key="category" href={paymentsHref(params, { sort: "category" })} className="sort-link">Category</Link>,
                  "Reference",
                  ""
                ]}
              >
                {paidRows.map((row) => (
                  <tr key={row.payment.id} className="table-row">
                    <td className="table-cell">
                      <Link href={paymentsHref(params, { payment: row.payment.id })} className="table-link font-semibold">
                        {formatDateOrUnset(row.paidAt)}
                      </Link>
                    </td>
                    <td className="table-cell text-[var(--muted)]">{row.tenantLabel}</td>
                    <td className="table-cell">
                      <span className="font-medium text-[var(--text)]">{row.property?.name ?? "Unassigned"}</span>
                      {row.unit ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">Unit {row.unit.unitNumber}</span>
                      ) : null}
                    </td>
                    <td className="table-cell">
                      <Badge tone={row.method === "Stripe" ? "brand" : "default"}>{row.method}</Badge>
                    </td>
                    <td className="table-cell font-semibold tabular-nums">{formatCurrency(row.amountPaid)}</td>
                    <td className="table-cell text-[var(--muted)]">{row.category}</td>
                    <td className="table-cell font-mono text-xs text-[var(--muted)]">{referenceFor(row.payment)}</td>
                    <td className="table-cell text-right">
                      <RowActionsMenu>
                        <RowActionLink href={paymentsHref(params, { editPayment: row.payment.id, deletePayment: undefined, charge: undefined, payment: undefined, ledger: undefined })}>Edit Amount</RowActionLink>
                        <RowActionLink href={paymentsHref(params, { payment: row.payment.id, charge: undefined, ledger: undefined })}>View Details</RowActionLink>
                        <RowActionLink href={paymentsHref(params, { deletePayment: row.payment.id, editPayment: undefined, charge: undefined, payment: undefined, ledger: undefined })} destructive>Delete</RowActionLink>
                      </RowActionsMenu>
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={Banknote}
                  title="No payment activity matches"
                  description="Completed money movement will appear here after a Stripe checkout or manual payment is marked paid."
                />
              </div>
            )}
          </DetailSection>

          {createMode === "import" ? (
            <DetailSection id="import-transactions" title="Import transactions" description="Bring external payment activity into Nexus for reconciliation.">
              <EmptyState
                icon={Upload}
                title="Transaction import is ready for a connector"
                description="Use the export tools today. This placeholder keeps the workflow visible without mixing import setup into the collections queue."
                action={<Button variant="secondary" disabled><Upload className="h-4 w-4" /> Import CSV</Button>}
              />
            </DetailSection>
          ) : null}
        </>
      ) : null}

      {/* ── ACCOUNTING TAB ── */}
      {activeTab === "accounting" ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Rent income YTD" value={formatCurrency(rentIncomeYtd)} detail={`${selectedYear} rental income`} tone="success" />
            <StatCard label="Deposits held" value={formatCurrency(depositsHeld)} detail="Security deposit liability" tone="brand" />
            <StatCard label="Late fees" value={formatCurrency(lateFeesCollected)} detail="Fee income collected" tone={lateFeesCollected > 0 ? "warning" : "default"} />
            <StatCard label="Other income" value={formatCurrency(otherIncome)} detail="Fees and reimbursements" />
          </section>

          <div className="payments-main-grid">
            <DetailSection
              title="Accounting ledger"
              description="Tax and bookkeeping view of paid income by category, property, and classification."
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  {[currentYear, currentYear - 1, currentYear - 2].map((year) => (
                    <Link
                      key={year}
                      href={paymentsHref(params, { tab: "accounting", year: String(year), ledger: undefined })}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                        selectedYear === year
                          ? "border-[var(--brand)] bg-[var(--accent-soft)] text-[var(--brand)]"
                          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
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
                  {portal.scope.properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.name}</option>
                  ))}
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
                  minWidth="0"
                  columns={["Date", "Category", "Description", "Property", "Amount", "Tax classification", ""]}
                >
                  {accountingRows.map((row) => (
                    <tr key={row.payment.id} className="table-row">
                      <td className="table-cell">
                        <Link href={paymentsHref(params, { ledger: row.payment.id })} className="table-link font-semibold">
                          {formatDateOrUnset(row.paidAt)}
                        </Link>
                      </td>
                      <td className="table-cell">
                        <Badge tone={row.category === "Deposit" ? "warning" : "default"}>{row.category}</Badge>
                      </td>
                      <td className="table-cell text-[var(--muted)]">{row.payment.description}</td>
                      <td className="table-cell text-[var(--muted)]">{row.property?.name ?? "Unassigned"}</td>
                      <td className="table-cell font-semibold tabular-nums">{formatCurrency(row.amountPaid)}</td>
                      <td className="table-cell text-[var(--muted)]">{row.taxClassification}</td>
                      <td className="table-cell text-right">
                        <RowActionsMenu>
                          <RowActionLink href={paymentsHref(params, { editPayment: row.payment.id, deletePayment: undefined, charge: undefined, payment: undefined, ledger: undefined })}>Edit Amount</RowActionLink>
                          <RowActionLink href={paymentsHref(params, { ledger: row.payment.id, charge: undefined, payment: undefined })}>View Record</RowActionLink>
                          <RowActionLink href={paymentsHref(params, { deletePayment: row.payment.id, editPayment: undefined, charge: undefined, payment: undefined, ledger: undefined })} destructive>Delete</RowActionLink>
                        </RowActionsMenu>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    icon={BookOpenCheck}
                    title="No accounting records match"
                    description="Paid income for the selected year and filters will appear here."
                  />
                </div>
              )}
            </DetailSection>

            <DetailSection title="Export" description="Download clean financial files for bookkeeping and tax preparation.">
              <div className="grid gap-2">
                <Link href={`/api/export/financials?format=csv&year=${selectedYear}`} className="export-card">
                  <div className="export-card-icon">
                    <Download className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="export-card-title">Export CSV</p>
                    <p className="export-card-desc">Plain text — works with any spreadsheet or accounting tool</p>
                  </div>
                </Link>
                <Link href={`/api/export/financials?format=xlsx&year=${selectedYear}`} className="export-card">
                  <div className="export-card-icon">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="export-card-title">Export Excel</p>
                    <p className="export-card-desc">Formatted workbook with category grouping and totals</p>
                  </div>
                </Link>
                <Link href={`/api/export/financials?format=csv&report=tax&year=${selectedYear}`} className="export-card">
                  <div className="export-card-icon">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="export-card-title">Tax report</p>
                    <p className="export-card-desc">Schedule E classifications for {selectedYear} tax filing</p>
                  </div>
                </Link>
                <Link href={`/api/export/financials?format=csv&report=rent-roll&year=${selectedYear}`} className="export-card">
                  <div className="export-card-icon">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="export-card-title">Rent roll</p>
                    <p className="export-card-desc">Unit-by-unit income summary for lenders and auditors</p>
                  </div>
                </Link>
              </div>
            </DetailSection>
          </div>
        </>
      ) : null}

      {/* ── CREATE FORM ── */}
      {createMode && createMode !== "import" ? (
        <DetailSection
          id="new-payment"
          title={createMode === "record" ? "Record payment" : createMode === "request" ? "Send payment request" : "Create charge"}
          description="One clean ledger item. Paid records flow to Payments and Accounting; open charges flow to Collections."
        >
          {portal.scope.units.length && portal.scope.tenants.length ? (
            <form action={createPaymentAction} className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="field-label">Unit</label>
                  <select name="unitId" defaultValue={selectedUnitId} className="field" required>
                    <option value="" disabled>Select unit</option>
                    {portal.scope.units.map((unit) => {
                      const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                      return (
                        <option key={unit.id} value={unit.id}>
                          {property?.name} — Unit {unit.unitNumber}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="field-label">Lease (optional)</label>
                  <select name="leaseId" defaultValue={selectedLeaseId} className="field">
                    <option value="">Auto-link active lease for unit</option>
                    {portal.scope.leases.map((lease) => {
                      const unit = portal.scope.units.find((item) => item.id === lease.unitId);
                      const tenant = portal.scope.tenants.find((item) => lease.tenantIds.includes(item.id));
                      return (
                        <option key={lease.id} value={lease.id}>
                          {lease.nexusLeaseId ?? lease.id} — Unit {unit?.unitNumber ?? "unassigned"}{tenant ? ` — ${tenant.firstName} ${tenant.lastName}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="field-label">Tenant</label>
                  <select name="tenantId" defaultValue={selectedTenantId} className="field" required>
                    <option value="" disabled>Select tenant</option>
                    {portal.scope.tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.lastName}, {tenant.firstName}{tenant.email ? ` — ${tenant.email}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Description</label>
                  <input
                    name="description"
                    placeholder={createMode === "charge" ? "e.g. August rent, Late fee" : "Payment description"}
                    className="field"
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Category</label>
                  <select name="categoryTag" defaultValue="Rent" className="field">
                    {["Rent", "Deposit", "Late Fee", "Pet Fee", "Parking", "Utility Reimbursement", "Application Fee", "Other"].map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Amount</label>
                    <input name="amount" type="number" step="0.01" min="0" placeholder="0.00" className="field" required />
                  </div>
                  <div>
                    <label className="field-label">Due date</label>
                    <input name="dueDate" type="date" className="field" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Paid date</label>
                    <input name="paidDate" type="date" className="field" />
                  </div>
                  <div>
                    <label className="field-label">Status</label>
                    <select name="status" className="field" defaultValue={createMode === "record" ? "PAID" : "PENDING"}>
                      <option value="PENDING">Pending</option>
                      <option value="PAID">Paid</option>
                      <option value="PARTIAL">Partial</option>
                      <option value="LATE">Late</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Late fee</label>
                    <input name="lateFeeAmount" type="number" step="0.01" min="0" placeholder="0.00" className="field" />
                  </div>
                  <div>
                    <label className="field-label">Balance due override</label>
                    <input name="balanceDue" type="number" step="0.01" min="0" placeholder="Leave blank to auto-calculate" className="field" />
                  </div>
                </div>
                <SubmitButton>
                  <Send className="h-4 w-4" />
                  {createMode === "record" ? "Record payment" : createMode === "request" ? "Send request" : "Create charge"}
                </SubmitButton>
              </div>
            </form>
          ) : (
            <EmptyState
              icon={Building2}
              title={portal.scope.units.length ? "Create a tenant first" : "Create a unit first"}
              description="Nexus links every charge and payment to a tenant, unit, property, and lease context when available."
            />
          )}
        </DetailSection>
      ) : null}

      {/* ── DRAWER BACKDROP ── */}
      {hasOpenDrawer ? (
        <Link href={closeAllDrawers} className="drawer-backdrop" aria-hidden="true" tabIndex={-1} />
      ) : null}

      {/* ── EDIT DRAWER ── */}
      {selectedEditPayment ? (
        <aside className="workflow-drawer" aria-label="Edit payment">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Edit payment</p>
              <h2 className="mt-1 truncate text-base font-semibold">{selectedEditPayment.tenantLabel}</h2>
            </div>
            <Link href={paymentMutationReturnHref} className="drawer-close-btn" aria-label="Close">
              <X className="h-4 w-4" />
            </Link>
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
              <div>
                <label className="field-label">Amount</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={String(
                    selectedEditPayment.payment.status === "PAID"
                      ? selectedEditPayment.amountPaid
                      : selectedEditPayment.payment.amount
                  )}
                  className="field"
                  required
                />
              </div>
              <SubmitButton pendingLabel="Updating…">Update payment</SubmitButton>
            </form>
          </div>
        </aside>
      ) : null}

      {/* ── DELETE DRAWER ── */}
      {selectedDeletePayment ? (
        <aside className="workflow-drawer" aria-label="Delete payment">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">Delete payment</p>
              <h2 className="mt-1 truncate text-base font-semibold">{selectedDeletePayment.tenantLabel}</h2>
            </div>
            <Link href={paymentMutationReturnHref} className="drawer-close-btn" aria-label="Close">
              <X className="h-4 w-4" />
            </Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-total">
              <span>{selectedDeletePayment.payment.description}</span>
              <strong>{formatCurrency(selectedDeletePayment.payment.status === "PAID" ? selectedDeletePayment.amountPaid : selectedDeletePayment.amountDue)}</strong>
            </div>
            <form action={deletePaymentAction} className="space-y-4">
              <input type="hidden" name="paymentId" value={selectedDeletePayment.payment.id} />
              <input type="hidden" name="returnTo" value={paymentMutationReturnHref} />
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                <input type="checkbox" name="confirmDelete" value="yes" required className="mt-0.5 h-4 w-4 rounded border-red-300 accent-red-600" />
                <span>I confirm: delete this payment record permanently.</span>
              </label>
              <SubmitButton variant="danger" pendingLabel="Deleting…">Delete payment</SubmitButton>
            </form>
          </div>
        </aside>
      ) : null}

      {/* ── COLLECTIONS DETAIL DRAWER ── */}
      {selectedCollection ? (
        <aside className="workflow-drawer" aria-label="Collections detail">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Collection detail</p>
              <h2 className="mt-1 truncate text-base font-semibold">{selectedCollection.tenantLabel}</h2>
            </div>
            <Link href={paymentsHref(params, { charge: undefined })} className="drawer-close-btn" aria-label="Close">
              <X className="h-4 w-4" />
            </Link>
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
              <div><span>Days late</span><strong>{selectedCollection.daysLate || "0"}</strong></div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Balance breakdown</p>
              <div className="space-y-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Original charge</span>
                  <strong className="tabular-nums">{formatCurrency(selectedCollection.payment.amount)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Late fees</span>
                  <strong className="tabular-nums">{formatCurrency(selectedCollection.payment.lateFeeAmount)}</strong>
                </div>
                <div className="flex justify-between border-t border-[var(--line)] pt-1.5">
                  <span className="font-semibold">Open balance</span>
                  <strong className="tabular-nums text-[var(--brand)]">{formatCurrency(selectedCollection.amountDue)}</strong>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Recent payments</p>
              <div className="space-y-1.5">
                {rows.filter((row) =>
                  row.payment.status === "PAID" &&
                  row.lease?.id === selectedCollection.lease?.id &&
                  (!selectedCollection.primaryTenant || row.primaryTenant?.id === selectedCollection.primaryTenant.id)
                ).slice(0, 4).map((row) => (
                  <div key={row.payment.id} className="flex justify-between rounded-md border border-[var(--line)] px-3 py-2 text-sm">
                    <span className="text-[var(--muted)]">{formatDateOrUnset(row.paidAt)}</span>
                    <strong className="tabular-nums">{formatCurrency(row.amountPaid)}</strong>
                  </div>
                ))}
                {!rows.some((row) =>
                  row.payment.status === "PAID" &&
                  row.lease?.id === selectedCollection.lease?.id &&
                  (!selectedCollection.primaryTenant || row.primaryTenant?.id === selectedCollection.primaryTenant.id)
                ) ? (
                  <p className="text-xs text-[var(--muted)]">No linked paid history for this lease yet.</p>
                ) : null}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Actions</p>
              <div className="grid gap-1.5">
                <Link href={`${paymentsHref(params, { create: "record", unitId: selectedCollection.unit?.id, leaseId: selectedCollection.lease?.id, tenantId: selectedCollection.primaryTenant?.id })}#new-payment`} className="drawer-action">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                  Record payment
                </Link>
                <Link href={paymentsHref(params, { editPayment: selectedCollection.payment.id, deletePayment: undefined, charge: undefined })} className="drawer-action">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                  Edit amount
                </Link>
                <Link href={`/messages?q=${encodeURIComponent(selectedCollection.tenantLabel)}`} className="drawer-action">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                  Send reminder
                </Link>
                {selectedCollection.lease ? (
                  <Link href={`/leases/${selectedCollection.lease.id}`} className="drawer-action">
                    <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                    View lease
                  </Link>
                ) : null}
                <Link href={`/tenants?q=${encodeURIComponent(selectedCollection.tenantLabel)}`} className="drawer-action">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                  View tenant
                </Link>
                <Link href={paymentsHref(params, { deletePayment: selectedCollection.payment.id, editPayment: undefined, charge: undefined })} className="drawer-action drawer-action-danger">
                  Delete payment
                </Link>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {/* ── PAYMENT DETAIL DRAWER ── */}
      {selectedPayment ? (
        <aside className="workflow-drawer" aria-label="Payment details">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Payment details</p>
              <h2 className="mt-1 truncate text-base font-semibold">{formatCurrency(selectedPayment.amountPaid)}</h2>
            </div>
            <Link href={paymentsHref(params, { payment: undefined })} className="drawer-close-btn" aria-label="Close">
              <X className="h-4 w-4" />
            </Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-grid">
              <div><span>Date paid</span><strong>{formatDateOrUnset(selectedPayment.paidAt)}</strong></div>
              <div><span>Method</span><strong>{selectedPayment.method}</strong></div>
              <div><span>Reference</span><strong>{referenceFor(selectedPayment.payment)}</strong></div>
              <div><span>Tax category</span><strong>{selectedPayment.category}</strong></div>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Linked lease</p>
              <p className="text-sm text-[var(--muted)]">{selectedPayment.lease?.nexusLeaseId ?? selectedPayment.lease?.id ?? "No linked lease"}</p>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Stripe transaction</p>
              <p className="break-all rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 font-mono text-xs text-[var(--muted)]">
                {selectedPayment.payment.stripePaymentIntentId ?? selectedPayment.payment.stripeCheckoutSessionId ?? "Manual payment — no Stripe reference"}
              </p>
            </div>

            {selectedPayment.payment.description ? (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Notes</p>
                <p className="text-sm text-[var(--muted)]">{selectedPayment.payment.description}</p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Actions</p>
              <div className="grid gap-1.5">
                <Link href={paymentsHref(params, { editPayment: selectedPayment.payment.id, deletePayment: undefined, payment: undefined })} className="drawer-action">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                  Edit amount
                </Link>
                <Link href={paymentsHref(params, { deletePayment: selectedPayment.payment.id, editPayment: undefined, payment: undefined })} className="drawer-action drawer-action-danger">
                  Delete payment
                </Link>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {/* ── ACCOUNTING RECORD DRAWER ── */}
      {selectedLedger ? (
        <aside className="workflow-drawer" aria-label="Accounting record">
          <div className="workflow-drawer-header">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Accounting record</p>
              <h2 className="mt-1 truncate text-base font-semibold">{selectedLedger.category}</h2>
            </div>
            <Link href={paymentsHref(params, { ledger: undefined })} className="drawer-close-btn" aria-label="Close">
              <X className="h-4 w-4" />
            </Link>
          </div>
          <div className="workflow-drawer-body">
            <div className="drawer-total">
              <span>{selectedLedger.taxClassification}</span>
              <strong className="tabular-nums">{formatCurrency(selectedLedger.amountPaid)}</strong>
            </div>
            <div className="drawer-grid">
              <div><span>Date</span><strong>{formatDateOrUnset(selectedLedger.paidAt)}</strong></div>
              <div><span>Property</span><strong>{selectedLedger.property?.name ?? "Unassigned"}</strong></div>
              <div><span>Unit</span><strong>{selectedLedger.unit?.unitNumber ?? "—"}</strong></div>
              <div><span>Reference</span><strong>{referenceFor(selectedLedger.payment)}</strong></div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Actions</p>
              <div className="grid gap-1.5">
                <Link href={paymentsHref(params, { editPayment: selectedLedger.payment.id, deletePayment: undefined, ledger: undefined })} className="drawer-action">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--brand)]" />
                  Edit amount
                </Link>
                <Link href={paymentsHref(params, { deletePayment: selectedLedger.payment.id, editPayment: undefined, ledger: undefined })} className="drawer-action drawer-action-danger">
                  Delete record
                </Link>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      <PaymentCalendar events={portal.calendar} defaultCollapsed />
    </div>
  );
}
