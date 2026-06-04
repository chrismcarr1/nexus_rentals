"use client";

import { FileQuestion, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createRentalApplicationAction } from "@/lib/actions";

export type ApplicationPropertyOption = {
  id: string;
  name: string;
  formattedAddress: string;
};

export type ApplicationUnitOption = {
  id: string;
  propertyId: string;
  unitNumber: string;
  monthlyRent: number;
  depositAmount: number;
};

const fieldOptions = [
  { value: "phone", label: "Phone" },
  { value: "currentAddress", label: "Current address" },
  { value: "employment", label: "Employment" },
  { value: "income", label: "Income" },
  { value: "rentalHistory", label: "Rental history" },
  { value: "references", label: "References" },
  { value: "pets", label: "Pet details" }
];

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[var(--text)]">
      <span>{label}</span>
      {hint ? <span className="text-xs font-medium text-[var(--muted)]">{hint}</span> : null}
    </span>
  );
}

export function RentalApplicationBuilder({
  properties,
  units,
  error
}: {
  properties: ApplicationPropertyOption[];
  units: ApplicationUnitOption[];
  error?: string;
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("0");
  const [documents, setDocuments] = useState(["Government ID", "Proof of income"]);
  const [questions, setQuestions] = useState(["Why are you moving?", "Have you ever been evicted?"]);
  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === propertyId), [propertyId, units]);
  const selectedProperty = properties.find((property) => property.id === propertyId);

  function chooseProperty(nextPropertyId: string) {
    setPropertyId(nextPropertyId);
    setUnitId("");
  }

  function chooseUnit(nextUnitId: string) {
    const unit = units.find((item) => item.id === nextUnitId);
    setUnitId(nextUnitId);
    if (unit) {
      setMonthlyRent(String(unit.monthlyRent));
      setSecurityDeposit(String(unit.depositAmount));
    }
  }

  if (!properties.length) {
    return (
      <Card className="p-8 text-center">
        <FileQuestion className="mx-auto h-8 w-8 text-[var(--brand)]" />
        <h2 className="mt-4 text-2xl font-semibold">Add a managed property first</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
          Applications must be tied to a property owned by the signed-in manager.
        </p>
      </Card>
    );
  }

  return (
    <form action={createRentalApplicationAction} className="space-y-4">
      {error ? <div className="rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

      <Card className="p-5 lg:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <p className="section-kicker">Application setup</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Listing details</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Create a public application for a unit or a general property listing.</p>
          </div>
          <div className="space-y-4">
            <label className="block">
              <FieldLabel label="Application title" />
              <Input name="title" required minLength={3} placeholder="Oakview Unit 2B Application" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel label="Property" />
                <Select name="propertyId" required value={propertyId} onChange={(event) => chooseProperty(event.target.value)}>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.name}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <FieldLabel label="Unit" hint="Optional" />
                <Select name="unitId" value={unitId} onChange={(event) => chooseUnit(event.target.value)}>
                  <option value="">General property listing</option>
                  {propertyUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>Unit {unit.unitNumber}</option>
                  ))}
                </Select>
              </label>
            </div>
            {selectedProperty ? (
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--muted)]">
                {selectedProperty.formattedAddress}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <FieldLabel label="Monthly rent" />
                <Input name="monthlyRent" required type="number" min="0" step="0.01" value={monthlyRent} onChange={(event) => setMonthlyRent(event.target.value)} />
              </label>
              <label className="block">
                <FieldLabel label="Security deposit" />
                <Input name="securityDeposit" required type="number" min="0" step="0.01" value={securityDeposit} onChange={(event) => setSecurityDeposit(event.target.value)} />
              </label>
              <label className="block">
                <FieldLabel label="Move-in date" />
                <Input name="availableMoveInDate" required type="date" defaultValue={todayInput()} />
              </label>
            </div>
            <label className="block">
              <FieldLabel label="Application fee" hint="Tracked only" />
              <Input name="applicationFee" type="number" min="0" step="0.01" defaultValue="0" />
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-5 lg:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <p className="section-kicker">Requirements</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Applicant fields</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Personal name and email are always required. Choose any additional sections to enforce.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fieldOptions.map((field) => (
              <label key={field.value} className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-white p-3 text-sm">
                <input type="checkbox" name="requiredFields" value={field.value} defaultChecked={field.value !== "pets"} className="mt-1" />
                <span className="font-semibold text-[var(--text)]">{field.label}</span>
              </label>
            ))}
            <label className="flex items-start gap-3 rounded-md border border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-3 text-sm">
              <input type="checkbox" name="allowCoApplicants" value="true" defaultChecked className="mt-1" />
              <span className="font-semibold text-[var(--text)]">Allow co-applicants</span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-3 text-sm">
              <input type="checkbox" name="allowPets" value="true" defaultChecked className="mt-1" />
              <span className="font-semibold text-[var(--text)]">Allow pets</span>
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-5 lg:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Documents</p>
                <h2 className="mt-2 text-xl font-semibold">Required documents</h2>
              </div>
              <Button type="button" variant="secondary" onClick={() => setDocuments((current) => [...current, ""])}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {documents.map((document, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input name="requiredDocuments" value={document} onChange={(event) => setDocuments((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Document name" />
                  <Button type="button" variant="ghost" onClick={() => setDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Screening</p>
                <h2 className="mt-2 text-xl font-semibold">Questions</h2>
              </div>
              <Button type="button" variant="secondary" onClick={() => setQuestions((current) => [...current, ""])}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {questions.map((question, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input name="screeningQuestions" value={question} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Screening question" />
                  <Button type="button" variant="ghost" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" name="intent" value="draft" variant="secondary">Save draft</Button>
        <Button type="submit" name="intent" value="publish">Create and publish</Button>
      </div>
    </form>
  );
}
