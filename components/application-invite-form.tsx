"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck2, Landmark, Send, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { sendApplicationInviteAction } from "@/lib/actions";
import { formatAppDate } from "@/lib/app-time";
import { formatPhoneNumber } from "@/lib/phone";

export type InviteUnitOption = {
  id: string;
  label: string;
  leaseStatusLabel: string;
  tenantName: string | null;
  leaseEndDate: string | null;
  availableFrom: string | null;
  availableNow: boolean;
};

export type InvitePropertyOption = {
  id: string;
  name: string;
  address: string;
  units: InviteUnitOption[];
};

export type InvitePrefill = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  propertyId?: string;
  unitId?: string;
  desiredMoveInDate?: string;
  requestBackgroundCheck?: boolean;
  requestIncomeVerification?: boolean;
  note?: string;
};

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[var(--text)]">
      <span>{label}</span>
      {hint ? <span className="text-xs font-medium text-[var(--muted)]">{hint}</span> : null}
    </span>
  );
}

export function ApplicationInviteForm({
  properties,
  prefill,
  checkrConfigured,
  plaidConfigured
}: {
  properties: InvitePropertyOption[];
  prefill: InvitePrefill;
  checkrConfigured: boolean;
  plaidConfigured: boolean;
}) {
  const [propertyId, setPropertyId] = useState(prefill.propertyId ?? "");
  const [propertySearch, setPropertySearch] = useState("");
  const [unitId, setUnitId] = useState(prefill.unitId ?? "");
  const [moveInDate, setMoveInDate] = useState(prefill.desiredMoveInDate ?? "");
  const [phone, setPhone] = useState(prefill.phone ?? "");
  const selectedProperty = properties.find((property) => property.id === propertyId) ?? null;
  const visibleProperties = useMemo(() => {
    const term = propertySearch.trim().toLowerCase();
    if (!term) return properties;
    return properties.filter(
      (property) =>
        property.id === propertyId ||
        property.name.toLowerCase().includes(term) ||
        property.address.toLowerCase().includes(term)
    );
  }, [properties, propertySearch, propertyId]);
  const units = selectedProperty?.units ?? [];
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? null;
  const propertyHasNoUnits = Boolean(propertyId) && units.length === 0;
  const moveInConflict = Boolean(
    selectedUnit && moveInDate && selectedUnit.availableFrom && moveInDate < selectedUnit.availableFrom
  );

  return (
    <form action={sendApplicationInviteAction} className="space-y-4">
      <Card className="p-5 lg:p-6">
        <p className="section-kicker">Applicant</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Who is applying?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block"><FieldLabel label="First name" /><Input name="firstName" required minLength={2} defaultValue={prefill.firstName} /></label>
          <label className="block"><FieldLabel label="Last name" /><Input name="lastName" required minLength={2} defaultValue={prefill.lastName} /></label>
          <label className="block"><FieldLabel label="Email" /><Input name="email" type="email" required defaultValue={prefill.email} /></label>
          <label className="block">
            <FieldLabel label="Phone" hint="Optional" />
            <Input name="phone" type="tel" inputMode="tel" maxLength={14} value={phone} onChange={(event) => setPhone(formatPhoneNumber(event.target.value))} />
          </label>
        </div>
      </Card>

      <Card className="p-5 lg:p-6">
        <p className="section-kicker">Rental context</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Property and unit</h2>
        {properties.length > 1 ? (
          <label className="mt-4 block">
            <FieldLabel label="Search properties" hint={`${visibleProperties.length} of ${properties.length} shown`} />
            <Input
              type="search"
              value={propertySearch}
              onChange={(event) => setPropertySearch(event.target.value)}
              placeholder="Search by property name or address"
            />
          </label>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <FieldLabel label="Property" />
            <Select
              name="propertyId"
              required
              value={propertyId}
              onChange={(event) => {
                setPropertyId(event.target.value);
                setUnitId("");
              }}
            >
              <option value="">Select a property</option>
              {visibleProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}{property.address ? ` - ${property.address}` : ""}
                </option>
              ))}
            </Select>
            {selectedProperty?.address ? (
              <span className="mt-2 block text-xs text-[var(--muted)]">{selectedProperty.address}</span>
            ) : null}
          </label>
          <label className="block">
            <FieldLabel label="Unit" hint="Optional" />
            <Select name="unitId" value={unitId} onChange={(event) => setUnitId(event.target.value)} disabled={!units.length}>
              <option value="">{units.length ? "Whole property / unassigned" : "Select a property first"}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.label}</option>
              ))}
            </Select>
          </label>
          <label className="block sm:col-span-2">
            <FieldLabel label="Desired move-in date" hint="Optional" />
            <Input
              name="desiredMoveInDate"
              type="date"
              value={moveInDate}
              min={selectedUnit?.availableFrom ?? undefined}
              onChange={(event) => setMoveInDate(event.target.value)}
            />
          </label>
        </div>

        {propertyHasNoUnits ? (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Create a unit before sending application invites. This property has no units yet.</span>
          </div>
        ) : null}

        {selectedUnit ? (
          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <CalendarCheck2 className="h-4 w-4 text-[var(--brand)]" />
                {selectedUnit.label} availability
              </p>
              <Badge tone={selectedUnit.availableNow ? "success" : selectedUnit.availableFrom ? "warning" : "danger"}>
                {selectedUnit.leaseStatusLabel}
              </Badge>
            </div>
            <div className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              {selectedUnit.tenantName ? <p>Current tenant: {selectedUnit.tenantName}</p> : null}
              {selectedUnit.leaseEndDate ? <p>Lease ends {formatAppDate(selectedUnit.leaseEndDate)}</p> : null}
              {selectedUnit.availableFrom ? (
                selectedUnit.availableNow ? (
                  <p className="font-semibold text-emerald-700">Earliest available move-in date: {formatAppDate(selectedUnit.availableFrom)}</p>
                ) : (
                  <p className="font-semibold text-amber-800">Unit unavailable until {formatAppDate(selectedUnit.availableFrom)}</p>
                )
              ) : (
                <p className="font-semibold text-red-700">Unit unavailable - an existing lease has no end date. Update that lease before inviting an applicant.</p>
              )}
            </div>
            {moveInConflict && selectedUnit.availableFrom ? (
              <p className="mt-3 rounded-md border border-amber-600/18 bg-amber-500/12 px-3 py-2 text-sm text-amber-800">
                {selectedUnit.label} is unavailable on {formatAppDate(moveInDate)}
                {selectedUnit.leaseEndDate ? ` because an existing lease runs through ${formatAppDate(selectedUnit.leaseEndDate)}` : ""}.
                Earliest available move-in date is {formatAppDate(selectedUnit.availableFrom)}.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-5 lg:p-6">
        <p className="section-kicker">Verification</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">What should the applicant complete?</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
            <input type="checkbox" checked readOnly className="mt-1" />
            <span className="font-semibold text-[var(--text)]">Rental application <span className="block text-xs font-medium text-[var(--muted)]">Always included.</span></span>
          </div>
          <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-white p-4 text-sm">
            <input type="checkbox" name="requestBackgroundCheck" defaultChecked={prefill.requestBackgroundCheck} className="mt-1" disabled={!checkrConfigured} />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-[var(--text)]"><ShieldCheck className="h-4 w-4 text-[var(--brand)]" /> Background check (Checkr)</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                {checkrConfigured
                  ? "The applicant consents at submission and completes the Checkr flow from their screening portal."
                  : "Checkr is not configured. Add CHECKR_API_KEY and CHECKR_PACKAGE_SLUG (or enable CHECKR_MOCK_MODE) to enable background checks."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-white p-4 text-sm">
            <input type="checkbox" name="requestIncomeVerification" defaultChecked={prefill.requestIncomeVerification} className="mt-1" disabled={!plaidConfigured} />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-[var(--text)]"><Landmark className="h-4 w-4 text-[var(--brand)]" /> Bank / income verification (Plaid)</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                {plaidConfigured
                  ? "The applicant connects a bank account through Plaid after submitting the application."
                  : "Plaid is not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV (or enable PLAID_MOCK_MODE) to enable bank/income verification."}
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card className="p-5 lg:p-6">
        <p className="section-kicker">Message</p>
        <label className="mt-2 block">
          <FieldLabel label="Note to applicant" hint="Optional" />
          <Textarea name="note" maxLength={1000} defaultValue={prefill.note} placeholder="Add context for the applicant, for example showing details or timing." />
        </label>
      </Card>

      <SubmitButton
        className="w-full sm:w-auto"
        pendingLabel="Sending invite..."
        disabled={propertyHasNoUnits || moveInConflict || Boolean(selectedUnit && !selectedUnit.availableFrom)}
      >
        <Send className="h-4 w-4" />
        Send application invite
      </SubmitButton>
    </form>
  );
}
