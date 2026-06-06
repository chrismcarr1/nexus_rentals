"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, FileText, Home, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { submitRentalApplicationAction } from "@/lib/actions";
import { formatAppDate } from "@/lib/app-time";
import { formatPhoneNumber } from "@/lib/phone";

export type PublicApplicationPayload = {
  publicSlug: string;
  title: string;
  location: string;
  address: string;
  monthlyRent: number;
  securityDeposit: number;
  availableMoveInDate: string;
  applicationFee: number;
  requiredFields: string[];
  requiredDocuments: Array<{ id: string; label: string; required: boolean }>;
  questions: Array<{ id: string; prompt: string; required: boolean }>;
  allowCoApplicants: boolean;
  allowPets: boolean;
};

type ApplicantFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  currentAddress: string;
  employment: string;
  monthlyIncome: string;
  rentalHistory: string;
  references: string;
  pets: string;
  vehicles: string;
  coApplicantFirstName: string;
  coApplicantLastName: string;
  coApplicantEmail: string;
  coApplicantPhone: string;
  documentNotes: string;
  authorizationAccepted: boolean;
  answers: Record<string, string>;
};

const steps = [
  { label: "Personal", icon: UserRound },
  { label: "Housing", icon: Home },
  { label: "Screening", icon: ClipboardList },
  { label: "Review", icon: CheckCircle2 }
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function dateLabel(value: string) {
  return formatAppDate(value);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
    <div className="rounded-md border border-[var(--line)] bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{value || "Not provided"}</p>
    </div>
  );
}

export function RentalApplicationPublicForm({
  application,
  error,
  submitted
}: {
  application: PublicApplicationPayload;
  error?: string;
  submitted?: boolean;
}) {
  const required = useMemo(() => new Set(application.requiredFields), [application.requiredFields]);
  const [step, setStep] = useState(0);
  const [clientError, setClientError] = useState(error ?? "");
  const [form, setForm] = useState<ApplicantFormState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    currentAddress: "",
    employment: "",
    monthlyIncome: "",
    rentalHistory: "",
    references: "",
    pets: "",
    vehicles: "",
    coApplicantFirstName: "",
    coApplicantLastName: "",
    coApplicantEmail: "",
    coApplicantPhone: "",
    documentNotes: "",
    authorizationAccepted: false,
    answers: {}
  });

  function patch(next: Partial<ApplicantFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function answer(questionId: string, value: string) {
    setForm((current) => ({ ...current, answers: { ...current.answers, [questionId]: value } }));
  }

  function validateStep(index: number) {
    if (index === 0) {
      if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) return "Enter your first and last name.";
      if (!isEmail(form.email)) return "Enter a valid email address.";
      if (required.has("phone") && !form.phone.trim()) return "Phone is required.";
    }
    if (index === 1) {
      if (required.has("currentAddress") && !form.currentAddress.trim()) return "Current address is required.";
      if (required.has("employment") && !form.employment.trim()) return "Employment information is required.";
      if (required.has("income") && Number(form.monthlyIncome) <= 0) return "Monthly income is required.";
      if (required.has("rentalHistory") && !form.rentalHistory.trim()) return "Rental history is required.";
      if (required.has("references") && !form.references.trim()) return "References are required.";
      if (application.allowPets && required.has("pets") && !form.pets.trim()) return "Pet details are required.";
    }
    if (index === 2) {
      const unanswered = application.questions.find((question) => question.required && !form.answers[question.id]?.trim());
      if (unanswered) return "Answer all required screening questions.";
    }
    if (index === 3 && !form.authorizationAccepted) {
      return "Authorization is required before submitting.";
    }
    return "";
  }

  function next() {
    const message = validateStep(step);
    if (message) {
      setClientError(message);
      return;
    }
    setClientError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    setClientError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  if (submitted) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
        <h1 className="mt-4 text-3xl font-semibold text-[var(--text)]">Application submitted</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Your application was sent to the property manager for review.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)] bg-[var(--accent-soft)] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-kicker">Rental application</p>
              <h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">{application.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{application.address}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{money(application.monthlyRent)}/mo</Badge>
              <Badge>{dateLabel(application.availableMoveInDate)}</Badge>
              {application.applicationFee > 0 ? <Badge tone="warning">{money(application.applicationFee)} fee</Badge> : null}
            </div>
          </div>
        </div>
        <div className="grid gap-2 p-4 md:grid-cols-4">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => index <= step && setStep(index)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                  index === step ? "border-[var(--brand)] bg-[var(--accent-soft)] text-[var(--brand)]" : index < step ? "border-emerald-600/15 bg-emerald-600/10 text-emerald-800" : "border-[var(--line)] bg-white text-[var(--muted)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </Card>

      {clientError ? <div className="rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">{clientError}</div> : null}

      <Card className="p-5 lg:p-6">
        {step === 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><FieldLabel label="First name" /><Input value={form.firstName} onChange={(event) => patch({ firstName: event.target.value })} /></label>
              <label className="block"><FieldLabel label="Last name" /><Input value={form.lastName} onChange={(event) => patch({ lastName: event.target.value })} /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><FieldLabel label="Email" /><Input type="email" value={form.email} onChange={(event) => patch({ email: event.target.value })} /></label>
              <label className="block"><FieldLabel label="Phone" hint={required.has("phone") ? "Required" : "Optional"} /><Input type="tel" inputMode="tel" maxLength={14} value={form.phone} onChange={(event) => patch({ phone: formatPhoneNumber(event.target.value) })} /></label>
            </div>
            <label className="block"><FieldLabel label="Date of birth" hint="Optional" /><Input type="date" value={form.dateOfBirth} onChange={(event) => patch({ dateOfBirth: event.target.value })} /></label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <label className="block"><FieldLabel label="Current address" hint={required.has("currentAddress") ? "Required" : "Optional"} /><Textarea value={form.currentAddress} onChange={(event) => patch({ currentAddress: event.target.value })} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><FieldLabel label="Employment" hint={required.has("employment") ? "Required" : "Optional"} /><Input value={form.employment} onChange={(event) => patch({ employment: event.target.value })} /></label>
              <label className="block"><FieldLabel label="Monthly income" hint={required.has("income") ? "Required" : "Optional"} /><Input type="number" min="0" step="0.01" value={form.monthlyIncome} onChange={(event) => patch({ monthlyIncome: event.target.value })} /></label>
            </div>
            <label className="block"><FieldLabel label="Rental history" hint={required.has("rentalHistory") ? "Required" : "Optional"} /><Textarea value={form.rentalHistory} onChange={(event) => patch({ rentalHistory: event.target.value })} /></label>
            <label className="block"><FieldLabel label="References" hint={required.has("references") ? "Required" : "Optional"} /><Textarea value={form.references} onChange={(event) => patch({ references: event.target.value })} /></label>
            {application.allowPets ? <label className="block"><FieldLabel label="Pets" hint={required.has("pets") ? "Required" : "Optional"} /><Textarea value={form.pets} onChange={(event) => patch({ pets: event.target.value })} /></label> : null}
            <label className="block"><FieldLabel label="Vehicles" hint="Optional" /><Textarea value={form.vehicles} onChange={(event) => patch({ vehicles: event.target.value })} /></label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            {application.allowCoApplicants ? (
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                <p className="text-sm font-semibold text-[var(--text)]">Co-applicant</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Input value={form.coApplicantFirstName} onChange={(event) => patch({ coApplicantFirstName: event.target.value })} placeholder="First name" />
                  <Input value={form.coApplicantLastName} onChange={(event) => patch({ coApplicantLastName: event.target.value })} placeholder="Last name" />
                  <Input type="email" value={form.coApplicantEmail} onChange={(event) => patch({ coApplicantEmail: event.target.value })} placeholder="Email" />
                  <Input type="tel" inputMode="tel" maxLength={14} value={form.coApplicantPhone} onChange={(event) => patch({ coApplicantPhone: formatPhoneNumber(event.target.value) })} placeholder="Phone" />
                </div>
              </div>
            ) : null}
            {application.requiredDocuments.length ? (
              <div className="rounded-md border border-[var(--line)] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><FileText className="h-4 w-4 text-[var(--brand)]" /> Requested documents</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {application.requiredDocuments.map((document) => <Badge key={document.id} tone={document.required ? "warning" : "default"}>{document.label}</Badge>)}
                </div>
                <Textarea className="mt-4" value={form.documentNotes} onChange={(event) => patch({ documentNotes: event.target.value })} placeholder="Document notes or delivery details" />
              </div>
            ) : null}
            {application.questions.map((question) => (
              <label key={question.id} className="block">
                <FieldLabel label={question.prompt} hint={question.required ? "Required" : "Optional"} />
                <Textarea value={form.answers[question.id] ?? ""} onChange={(event) => answer(question.id, event.target.value)} />
              </label>
            ))}
            {!application.questions.length ? <p className="text-sm text-[var(--muted)]">No screening questions are configured for this application.</p> : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewRow label="Applicant" value={`${form.firstName} ${form.lastName}`} />
              <ReviewRow label="Email" value={form.email} />
              <ReviewRow label="Phone" value={form.phone} />
              <ReviewRow label="Income" value={form.monthlyIncome ? money(Number(form.monthlyIncome)) : ""} />
              <ReviewRow label="Property" value={application.location} />
              <ReviewRow label="Move-in" value={dateLabel(application.availableMoveInDate)} />
            </div>
            <label className="flex items-start gap-3 rounded-md border border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-4 text-sm">
              <input type="checkbox" checked={form.authorizationAccepted} onChange={(event) => patch({ authorizationAccepted: event.target.checked })} className="mt-1" />
              <span className="font-semibold text-[var(--text)]">I confirm this application is accurate and authorize the manager to review it.</span>
            </label>
            <form action={submitRentalApplicationAction} className="space-y-3">
              <input type="hidden" name="publicSlug" value={application.publicSlug} />
              {Object.entries(form).map(([key, value]) => {
                if (key === "answers" || typeof value === "object") return null;
                return <input key={key} type="hidden" name={key} value={typeof value === "boolean" ? String(value) : value} />;
              })}
              {application.questions.map((question) => (
                <input key={question.id} type="hidden" name={`question_${question.id}`} value={form.answers[question.id] ?? ""} />
              ))}
              <SubmitButton className="w-full" pendingLabel="Submitting application...">
                <CheckCircle2 className="h-4 w-4" />
                Submit application
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" disabled={step === 0} onClick={back}><ArrowLeft className="h-4 w-4" /> Back</Button>
        {step < steps.length - 1 ? <Button type="button" onClick={next}>Continue <ArrowRight className="h-4 w-4" /></Button> : null}
      </div>
    </div>
  );
}
