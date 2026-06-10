"use client";

import { useMemo, useState } from "react";
import { Landmark, Send, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { sendApplicationInviteAction } from "@/lib/actions";
import { formatPhoneNumber } from "@/lib/phone";

export type InvitePropertyOption = {
  id: string;
  name: string;
  units: Array<{ id: string; label: string }>;
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
  const [phone, setPhone] = useState(prefill.phone ?? "");
  const units = useMemo(
    () => properties.find((property) => property.id === propertyId)?.units ?? [],
    [properties, propertyId]
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
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <FieldLabel label="Property" />
            <Select name="propertyId" required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              <option value="">Select a property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>{property.name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <FieldLabel label="Unit" hint="Optional" />
            <Select name="unitId" defaultValue={prefill.unitId ?? ""} disabled={!units.length}>
              <option value="">{units.length ? "Whole property / unassigned" : "Select a property first"}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.label}</option>
              ))}
            </Select>
          </label>
          <label className="block sm:col-span-2">
            <FieldLabel label="Desired move-in date" hint="Optional" />
            <Input name="desiredMoveInDate" type="date" defaultValue={prefill.desiredMoveInDate} />
          </label>
        </div>
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

      <SubmitButton className="w-full sm:w-auto" pendingLabel="Sending invite...">
        <Send className="h-4 w-4" />
        Send application invite
      </SubmitButton>
    </form>
  );
}
