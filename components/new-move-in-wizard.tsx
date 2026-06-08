"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, CheckCircle2, DollarSign, FileText, Home, Mail, Plus, ReceiptText, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { FileUploader } from "@/components/file-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { createMoveInAction } from "@/lib/actions";
import { addMonthsToDateKey, appDateKeyFromValue, DEFAULT_RENT_DUE_TIME, formatAppDate, formatRentDueTime, getAppDateKey, isValidRentDueTime } from "@/lib/app-time";
import { formatPhoneNumber } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type MoveInPropertyOption = {
  id: string;
  name: string;
  formattedAddress: string;
  availableUnitCount: number;
};

export type MoveInUnitOption = {
  id: string;
  propertyId: string;
  unitNumber: string;
  nickname?: string | null;
  bedrooms: number;
  bathrooms: number;
  monthlyRent: number;
  depositAmount: number;
  occupancyStatus: string;
  availableStartDate: string;
  resumableLease?: {
    id: string;
    status: string;
    tenantEmail: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    securityDeposit: number;
    dueDay: number;
    rentDueTime?: string;
    documentPath?: string;
  } | null;
};

export type MoveInPrefill = Partial<{
  applicationSubmissionId: string;
  propertyId: string;
  unitId: string;
  tenantFirstName: string;
  tenantLastName: string;
  tenantEmail: string;
  tenantPhone: string;
  startDate: string;
  moveInDate: string;
  monthlyRent: number;
  securityDeposit: number;
}>;

type MoveInFormState = {
  propertyId: string;
  unitId: string;
  tenantFirstName: string;
  tenantLastName: string;
  tenantEmail: string;
  tenantPhone: string;
  employer: string;
  emergencyName: string;
  emergencyPhone: string;
  startDate: string;
  endDate: string;
  moveInDate: string;
  monthlyRent: string;
  securityDeposit: string;
  dueDay: string;
  rentDueTime: string;
  firstRentDueDate: string;
  securityDepositDueDate: string;
  createFirstRentCharge: boolean;
  createSecurityDepositCharge: boolean;
  additionalChargeDescription: string;
  additionalChargeAmount: string;
  additionalChargeDueDate: string;
  recurringCharges: string;
  lateFeePolicy: string;
  notes: string;
  documentPath: string;
  sendInvite: boolean;
  existingLeaseId: string;
  applicationSubmissionId: string;
};

const steps = [
  { label: "Property", icon: Building2 },
  { label: "Tenant", icon: UserRound },
  { label: "Lease", icon: CalendarDays },
  { label: "Billing", icon: ReceiptText },
  { label: "Review", icon: CheckCircle2 }
];

function formatCurrency(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value: string) {
  return value ? formatAppDate(value) : "Not set";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function latestDateKey(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

function suggestedUnitStartDate(unit: MoveInUnitOption | null | undefined, fallback: string) {
  return latestDateKey(unit?.availableStartDate, unit?.resumableLease?.startDate, fallback);
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[var(--text)]">
      <span>{label}</span>
      {hint ? <span className="text-xs font-medium text-[var(--muted)]">{hint}</span> : null}
    </span>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--line)] bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}

export function NewMoveInWizard({
  properties,
  units,
  initialPropertyId,
  initialUnitId,
  prefill,
  error
}: {
  properties: MoveInPropertyOption[];
  units: MoveInUnitOption[];
  initialPropertyId?: string;
  initialUnitId?: string;
  prefill?: MoveInPrefill;
  error?: string;
}) {
  const today = getAppDateKey();
  const requestedPropertyId = prefill?.propertyId ?? initialPropertyId;
  const requestedUnitId = prefill?.unitId ?? initialUnitId;
  const requestedPropertyHasUnits = Boolean(requestedPropertyId && units.some((unit) => unit.propertyId === requestedPropertyId));
  const propertyWithUnits = properties.find((property) => units.some((unit) => unit.propertyId === property.id));
  const defaultPropertyId =
    properties.some((property) => property.id === requestedPropertyId) && requestedPropertyHasUnits
      ? requestedPropertyId!
      : propertyWithUnits?.id ?? properties[0]?.id ?? "";
  const firstUnitForProperty = units.find((unit) => unit.propertyId === defaultPropertyId);
  const defaultUnit = units.find((unit) => unit.id === requestedUnitId && unit.propertyId === defaultPropertyId) ?? firstUnitForProperty ?? null;
  const defaultStartDate = suggestedUnitStartDate(defaultUnit, prefill?.startDate ?? prefill?.moveInDate ?? today);
  const defaultEndDate =
    defaultUnit?.resumableLease?.endDate && defaultUnit.resumableLease.endDate > defaultStartDate
      ? defaultUnit.resumableLease.endDate
      : addMonthsToDateKey(defaultStartDate, 12);
  const [step, setStep] = useState(0);
  const [clientError, setClientError] = useState(error ?? "");
  const [form, setForm] = useState<MoveInFormState>({
    propertyId: defaultPropertyId,
    unitId: defaultUnit?.id ?? "",
    tenantFirstName: prefill?.tenantFirstName ?? "",
    tenantLastName: prefill?.tenantLastName ?? "",
    tenantEmail: prefill?.tenantEmail ?? defaultUnit?.resumableLease?.tenantEmail ?? "",
    tenantPhone: formatPhoneNumber(prefill?.tenantPhone ?? ""),
    employer: "",
    emergencyName: "",
    emergencyPhone: "",
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    moveInDate: latestDateKey(prefill?.moveInDate, defaultStartDate),
    monthlyRent:
      prefill?.monthlyRent != null
        ? String(prefill.monthlyRent)
        : defaultUnit?.resumableLease
          ? String(defaultUnit.resumableLease.monthlyRent)
          : defaultUnit?.monthlyRent
            ? String(defaultUnit.monthlyRent)
            : "",
    securityDeposit:
      prefill?.securityDeposit != null
        ? String(prefill.securityDeposit)
        : defaultUnit?.resumableLease
          ? String(defaultUnit.resumableLease.securityDeposit)
          : defaultUnit?.depositAmount
            ? String(defaultUnit.depositAmount)
            : "0",
    dueDay: String(defaultUnit?.resumableLease?.dueDay ?? 1),
    rentDueTime: defaultUnit?.resumableLease?.rentDueTime ?? DEFAULT_RENT_DUE_TIME,
    firstRentDueDate: today,
    securityDepositDueDate: today,
    createFirstRentCharge: true,
    createSecurityDepositCharge: true,
    additionalChargeDescription: "",
    additionalChargeAmount: "",
    additionalChargeDueDate: "",
    recurringCharges: "",
    lateFeePolicy: "",
    notes: "",
    documentPath: defaultUnit?.resumableLease?.documentPath ?? "",
    sendInvite: defaultUnit?.resumableLease?.status !== "invited",
    existingLeaseId: defaultUnit?.resumableLease?.id ?? "",
    applicationSubmissionId: prefill?.applicationSubmissionId ?? ""
  });

  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === form.propertyId), [form.propertyId, units]);
  const selectedProperty = properties.find((property) => property.id === form.propertyId) ?? null;
  const selectedUnit = units.find((unit) => unit.id === form.unitId) ?? null;
  const totalInitialCharges =
    (form.createFirstRentCharge ? Number(form.monthlyRent || 0) : 0) +
    (form.createSecurityDepositCharge ? Number(form.securityDeposit || 0) : 0) +
    Number(form.additionalChargeAmount || 0);

  function patch(next: Partial<MoveInFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function selectProperty(propertyId: string) {
    const nextUnit = units.find((unit) => unit.propertyId === propertyId) ?? null;
    const nextStartDate = suggestedUnitStartDate(nextUnit, today);
    const nextEndDate =
      nextUnit?.resumableLease?.endDate && nextUnit.resumableLease.endDate > nextStartDate
        ? nextUnit.resumableLease.endDate
        : addMonthsToDateKey(nextStartDate, 12);
    patch({
      propertyId,
      unitId: nextUnit?.id ?? "",
      tenantEmail: nextUnit?.resumableLease?.tenantEmail ?? "",
      startDate: nextStartDate,
      endDate: nextEndDate,
      moveInDate: nextStartDate,
      monthlyRent: String(nextUnit?.resumableLease?.monthlyRent ?? nextUnit?.monthlyRent ?? ""),
      securityDeposit: String(nextUnit?.resumableLease?.securityDeposit ?? nextUnit?.depositAmount ?? 0),
      dueDay: String(nextUnit?.resumableLease?.dueDay ?? 1),
      rentDueTime: nextUnit?.resumableLease?.rentDueTime ?? DEFAULT_RENT_DUE_TIME,
      documentPath: nextUnit?.resumableLease?.documentPath ?? "",
      sendInvite: nextUnit?.resumableLease?.status !== "invited",
      existingLeaseId: nextUnit?.resumableLease?.id ?? ""
    });
  }

  function selectUnit(unitId: string) {
    const unit = units.find((item) => item.id === unitId) ?? null;
    const nextStartDate = suggestedUnitStartDate(unit, today);
    const nextEndDate =
      unit?.resumableLease?.endDate && unit.resumableLease.endDate > nextStartDate
        ? unit.resumableLease.endDate
        : addMonthsToDateKey(nextStartDate, 12);
    patch({
      unitId,
      tenantEmail: unit?.resumableLease?.tenantEmail ?? "",
      startDate: nextStartDate,
      endDate: nextEndDate,
      moveInDate: nextStartDate,
      monthlyRent: String(unit?.resumableLease?.monthlyRent ?? unit?.monthlyRent ?? ""),
      securityDeposit: String(unit?.resumableLease?.securityDeposit ?? unit?.depositAmount ?? 0),
      dueDay: String(unit?.resumableLease?.dueDay ?? 1),
      rentDueTime: unit?.resumableLease?.rentDueTime ?? DEFAULT_RENT_DUE_TIME,
      documentPath: unit?.resumableLease?.documentPath ?? "",
      sendInvite: unit?.resumableLease?.status !== "invited",
      existingLeaseId: unit?.resumableLease?.id ?? ""
    });
  }

  function changeStartDate(startDate: string) {
    setForm((current) => ({
      ...current,
      startDate,
      moveInDate: !current.moveInDate || current.moveInDate < startDate ? startDate : current.moveInDate,
      endDate: !current.endDate || current.endDate <= startDate ? addMonthsToDateKey(startDate, 12) : current.endDate
    }));
  }

  function validateStep(index: number) {
    if (index === 0) {
      if (!form.propertyId) return "Select a property.";
      if (!form.unitId) return "Select an available unit.";
    }
    if (index === 1) {
      if (form.tenantFirstName.trim().length < 2 || form.tenantLastName.trim().length < 2) return "Enter the tenant's first and last name.";
      if (!isEmail(form.tenantEmail)) return "Enter a valid tenant email.";
    }
    if (index === 2) {
      const start = appDateKeyFromValue(form.startDate);
      const end = appDateKeyFromValue(form.endDate);
      const moveIn = appDateKeyFromValue(form.moveInDate);
      if (!form.startDate || !form.endDate || !form.moveInDate) return "Set the lease start, lease end, and move-in dates.";
      if (!start || !end || end < start) return "Lease end date must be after the start date.";
      if (selectedUnit?.availableStartDate && start < selectedUnit.availableStartDate) {
        return `This unit is available starting ${formatDate(selectedUnit.availableStartDate)}.`;
      }
      if (!moveIn || moveIn < start || moveIn > end) return "Move-in date must be within the lease term.";
      if (Number(form.monthlyRent) < 1) return "Set a monthly rent greater than zero.";
      if (Number(form.securityDeposit) < 0) return "Security deposit cannot be negative.";
    }
    if (index === 3) {
      const dueDay = Number(form.dueDay);
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return "Set a rent due day from 1 to 28.";
      if (!isValidRentDueTime(form.rentDueTime)) return "Set a valid rent due time.";
      if (form.createFirstRentCharge && !form.firstRentDueDate) return "Set the first rent charge due date.";
      if (form.createSecurityDepositCharge && !form.securityDepositDueDate) return "Set the security deposit due date.";
      if (Number(form.additionalChargeAmount || 0) > 0 && !form.additionalChargeDescription.trim()) return "Name the additional move-in charge.";
    }
    return "";
  }

  function nextStep() {
    const message = validateStep(step);
    if (message) {
      setClientError(message);
      return;
    }
    setClientError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function previousStep() {
    setClientError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  if (!properties.length) {
    return (
      <Card className="p-8 text-center">
        <Building2 className="mx-auto h-8 w-8 text-[var(--brand)]" />
        <h2 className="mt-4 text-2xl font-semibold text-[var(--text)]">Add a property first</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
          A move-in needs a property and an available unit before a lease can be generated.
        </p>
        <Link href="/properties" className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
          <Plus className="h-4 w-4" />
          Add property
        </Link>
      </Card>
    );
  }

  if (!units.length) {
    return (
      <Card className="p-8 text-center">
        <Home className="mx-auto h-8 w-8 text-[var(--brand)]" />
        <h2 className="mt-4 text-2xl font-semibold text-[var(--text)]">No available units</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
          Units with an open-ended active lease cannot be scheduled until an end date is added.
        </p>
        <Link href="/properties" className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]">
          Review properties
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {clientError ? (
        <div className="rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">{clientError}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="grid gap-2 md:grid-cols-5">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const active = index === step;
              const complete = index < step;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (index <= step) setStep(index);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold transition",
                    active && "border-[var(--brand)] bg-[var(--accent-soft)] text-[var(--brand)]",
                    complete && "border-emerald-600/15 bg-emerald-600/10 text-emerald-800",
                    !active && !complete && "border-[var(--line)] bg-white text-[var(--muted)]"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 lg:p-6">
          {step === 0 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <p className="section-kicker">Step 1</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Select the home</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Vacant units and occupied units with a known future availability date are listed.</p>
              </div>
              <div className="space-y-4">
                <label className="block">
                  <FieldLabel label="Property" />
                  <Select value={form.propertyId} onChange={(event) => selectProperty(event.target.value)}>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} ({property.availableUnitCount} available)
                      </option>
                    ))}
                  </Select>
                </label>
                {selectedProperty ? (
                  <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm leading-6 text-[var(--muted)]">
                    {selectedProperty.formattedAddress}
                  </div>
                ) : null}
                <label className="block">
                  <FieldLabel label="Available unit" />
                  <Select required value={form.unitId} onChange={(event) => selectUnit(event.target.value)}>
                    <option value="" disabled>Select a unit</option>
                    {propertyUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        Unit {unit.unitNumber}{unit.nickname ? ` - ${unit.nickname}` : ""}
                        {unit.resumableLease
                          ? ` - continue ${unit.resumableLease.status} lease`
                          : unit.availableStartDate > today
                            ? ` - available ${formatDate(unit.availableStartDate)}`
                            : ""}
                      </option>
                    ))}
                  </Select>
                </label>
                {selectedUnit ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <ReviewRow label="Current rent" value={formatCurrency(selectedUnit.monthlyRent)} />
                      <ReviewRow label="Deposit" value={formatCurrency(selectedUnit.depositAmount)} />
                      <ReviewRow label="Status" value={selectedUnit.occupancyStatus} />
                      <ReviewRow label="Available" value={formatDate(selectedUnit.availableStartDate)} />
                    </div>
                    {selectedUnit.occupancyStatus === "OCCUPIED" ? (
                      <p className="rounded-md border border-amber-600/18 bg-amber-500/12 px-3 py-2 text-xs leading-5 text-amber-800">
                        This unit is currently occupied. The new lease must start on or after {formatDate(selectedUnit.availableStartDate)}.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
                    This property has no available unit right now.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <p className="section-kicker">Step 2</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Tenant information</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">The email connects the lease to an existing tenant account or powers the portal invite.</p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel label="First name" />
                    <Input value={form.tenantFirstName} onChange={(event) => patch({ tenantFirstName: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel label="Last name" />
                    <Input value={form.tenantLastName} onChange={(event) => patch({ tenantLastName: event.target.value })} />
                  </label>
                </div>
                {selectedUnit?.resumableLease ? (
                  <div className="rounded-md border border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-4 text-sm">
                    <p className="font-semibold text-[var(--text)]">Continuing existing lease</p>
                    <p className="mt-1 leading-6 text-[var(--muted)]">
                      This move-in will complete the existing {selectedUnit.resumableLease.status} lease and preserve its attached agreement.
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel label="Email" />
                    <Input type="email" value={form.tenantEmail} onChange={(event) => patch({ tenantEmail: event.target.value })} placeholder="resident@example.com" />
                  </label>
                  <label className="block">
                    <FieldLabel label="Phone" hint="Optional" />
                    <Input type="tel" inputMode="tel" maxLength={14} value={form.tenantPhone} onChange={(event) => patch({ tenantPhone: formatPhoneNumber(event.target.value) })} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel label="Employer" hint="Optional" />
                    <Input value={form.employer} onChange={(event) => patch({ employer: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel label="Emergency contact" hint="Optional" />
                    <Input value={form.emergencyName} onChange={(event) => patch({ emergencyName: event.target.value })} />
                  </label>
                </div>
                <label className="block">
                  <FieldLabel label="Emergency phone" hint="Optional" />
                  <Input type="tel" inputMode="tel" maxLength={14} value={form.emergencyPhone} onChange={(event) => patch({ emergencyPhone: formatPhoneNumber(event.target.value) })} />
                </label>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <p className="section-kicker">Step 3</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Lease terms</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Set the agreement dates, move-in date, rent, deposit, and recurring notes.</p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block">
                    <FieldLabel label="Lease start" />
                    <Input
                      type="date"
                      min={selectedUnit?.availableStartDate}
                      value={form.startDate}
                      onChange={(event) => changeStartDate(event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel label="Lease end" />
                    <Input type="date" min={form.startDate} value={form.endDate} onChange={(event) => patch({ endDate: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel label="Move-in date" />
                    <Input type="date" min={form.startDate} value={form.moveInDate} onChange={(event) => patch({ moveInDate: event.target.value })} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel label="Monthly rent" />
                    <Input type="number" min="1" step="0.01" value={form.monthlyRent} onChange={(event) => patch({ monthlyRent: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel label="Security deposit" />
                    <Input type="number" min="0" step="0.01" value={form.securityDeposit} onChange={(event) => patch({ securityDeposit: event.target.value })} />
                  </label>
                </div>
                <label className="block">
                  <FieldLabel label="Recurring charges" hint="Optional" />
                  <Textarea value={form.recurringCharges} onChange={(event) => patch({ recurringCharges: event.target.value })} placeholder="Utilities, parking, pet rent, or other monthly charges." />
                </label>
                <label className="block">
                  <FieldLabel label="Late fee policy" hint="Optional" />
                  <Input value={form.lateFeePolicy} onChange={(event) => patch({ lateFeePolicy: event.target.value })} />
                </label>
                <div>
                  <FieldLabel label="Lease agreement" hint="PDF, DOC, DOCX, or image" />
                  <FileUploader
                    label="Attach signed or prepared lease"
                    accept=".pdf,.doc,.docx,image/*"
                    multiple={false}
                    onChange={(items) => patch({ documentPath: items[0]?.path ?? "" })}
                  />
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    This agreement will be available from the tenant invite and their lease page.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <p className="section-kicker">Step 4</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Billing and portal access</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Create initial ledger charges and decide whether to send the tenant portal invite.</p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block">
                    <FieldLabel label="Rent due day" />
                    <Input type="number" min="1" max="28" value={form.dueDay} onChange={(event) => patch({ dueDay: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel label="Rent due time" />
                    <Input type="time" value={form.rentDueTime} onChange={(event) => patch({ rentDueTime: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel label="First rent due date" />
                    <Input type="date" value={form.firstRentDueDate} onChange={(event) => patch({ firstRentDueDate: event.target.value })} />
                  </label>
                </div>
                <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-white p-4 text-sm">
                  <input type="checkbox" checked={form.createFirstRentCharge} onChange={(event) => patch({ createFirstRentCharge: event.target.checked })} className="mt-1" />
                  <span>
                    <span className="block font-semibold text-[var(--text)]">Create first rent charge</span>
                    <span className="mt-1 block text-[var(--muted)]">{formatCurrency(form.monthlyRent)} due {formatDate(form.firstRentDueDate)}</span>
                  </span>
                </label>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.5fr)]">
                  <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-white p-4 text-sm">
                    <input type="checkbox" checked={form.createSecurityDepositCharge} onChange={(event) => patch({ createSecurityDepositCharge: event.target.checked })} className="mt-1" />
                    <span>
                      <span className="block font-semibold text-[var(--text)]">Create security deposit charge</span>
                      <span className="mt-1 block text-[var(--muted)]">{formatCurrency(form.securityDeposit)}</span>
                    </span>
                  </label>
                  <label className="block">
                    <FieldLabel label="Deposit due" />
                    <Input type="date" value={form.securityDepositDueDate} onChange={(event) => patch({ securityDepositDueDate: event.target.value })} />
                  </label>
                </div>
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <DollarSign className="h-4 w-4 text-[var(--brand)]" />
                    Additional move-in charge
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Input value={form.additionalChargeDescription} onChange={(event) => patch({ additionalChargeDescription: event.target.value })} placeholder="Charge name" />
                    <Input type="number" min="0" step="0.01" value={form.additionalChargeAmount} onChange={(event) => patch({ additionalChargeAmount: event.target.value })} placeholder="Amount" />
                    <Input type="date" value={form.additionalChargeDueDate} onChange={(event) => patch({ additionalChargeDueDate: event.target.value })} />
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-md border border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-4 text-sm">
                  <input type="checkbox" checked={form.sendInvite} onChange={(event) => patch({ sendInvite: event.target.checked })} className="mt-1" />
                  <span>
                    <span className="block font-semibold text-[var(--text)]">Invite tenant to the portal</span>
                    <span className="mt-1 block text-[var(--muted)]">Creates a secure invite for {form.tenantEmail || "the tenant"}.</span>
                  </span>
                </label>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <p className="section-kicker">Step 5</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Review move-in</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Submitting creates the tenant record, lease, initial charges, unit status updates, and optional portal invite.</p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReviewRow label="Property" value={selectedProperty?.name ?? "Not selected"} />
                  <ReviewRow label="Unit" value={selectedUnit ? `Unit ${selectedUnit.unitNumber}` : "Not selected"} />
                  <ReviewRow label="Tenant" value={`${form.tenantFirstName} ${form.tenantLastName}`.trim() || "Not set"} />
                  <ReviewRow label="Email" value={form.tenantEmail || "Not set"} />
                  <ReviewRow label="Lease term" value={`${formatDate(form.startDate)} to ${formatDate(form.endDate)}`} />
                  <ReviewRow label="Move-in" value={formatDate(form.moveInDate)} />
                  <ReviewRow label="Monthly rent" value={formatCurrency(form.monthlyRent)} />
                  <ReviewRow label="Security deposit" value={formatCurrency(form.securityDeposit)} />
                  <ReviewRow label="Rent schedule" value={`Day ${form.dueDay} at ${formatRentDueTime(form.rentDueTime)}`} />
                  <ReviewRow label="Initial charges" value={formatCurrency(totalInitialCharges)} />
                  <ReviewRow label="Lease agreement" value={form.documentPath ? "Attached" : "Not attached"} />
                  <ReviewRow label="Lease record" value={form.existingLeaseId ? "Continue existing lease" : "Create new lease"} />
                </div>
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={form.sendInvite ? "warning" : "default"}>{form.sendInvite ? "Invite will be created" : "Invite skipped"}</Badge>
                    <Badge tone="success">{form.createFirstRentCharge || form.createSecurityDepositCharge || Number(form.additionalChargeAmount || 0) > 0 ? "Ledger charges enabled" : "No initial charges"}</Badge>
                    {form.documentPath ? (
                      <Badge tone="success">
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        Agreement attached
                      </Badge>
                    ) : null}
                  </div>
                  <label className="mt-4 block">
                    <FieldLabel label="Manager notes" hint="Optional" />
                    <Textarea value={form.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder="Internal setup notes." />
                  </label>
                </div>
                <form action={createMoveInAction} className="space-y-4">
                  {Object.entries(form).map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={typeof value === "boolean" ? String(value) : value} />
                  ))}
                  <SubmitButton className="w-full" pendingLabel="Creating move-in...">
                    <CheckCircle2 className="h-4 w-4" />
                    Complete move-in
                  </SubmitButton>
                </form>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)]">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" disabled={step === 0} onClick={previousStep}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button type="button" onClick={nextStep} disabled={step === 0 && !propertyUnits.length}>
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
