"use client";

import { CheckCircle2, Circle, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createListingAction, updateListingAction } from "@/lib/listing-actions";
import { buildListingDefaultsFromPropertyUnit } from "@/lib/listing-defaults";

export type ListingPropertyOption = {
  id: string;
  name: string;
  formattedAddress: string;
  description?: string;
  amenities?: string;
  petPolicy?: string;
  parking?: string;
  utilities?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  photoUrls: string[];
};

export type ListingUnitOption = {
  id: string;
  propertyId: string;
  unitNumber: string;
  monthlyRent: number;
  depositAmount: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  // Already a yyyy-mm-dd date key, ready for the date input.
  availabilityDate?: string;
  leaseTerms?: string;
  unitDescription?: string;
  amenities?: string;
  photoUrls: string[];
};

export type ListingFormValues = {
  id?: string;
  propertyId: string;
  unitId: string;
  rent: string;
  deposit: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  availabilityDate: string;
  leaseTerms: string;
  description: string;
  amenities: string;
  petPolicy: string;
  parking: string;
  utilities: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  photoUrls: string[];
};

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[var(--text)]">
      <span>{label}</span>
      {hint ? <span className="text-xs font-medium text-[var(--muted)]">{hint}</span> : null}
    </span>
  );
}

function ReadinessRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-[var(--muted)]" />}
      <span className={ok ? "text-[var(--text)]" : "text-[var(--muted)]"}>{label}</span>
    </li>
  );
}

export function ListingEditor({
  mode,
  properties,
  units,
  values,
  initialPropertyId,
  initialUnitId,
  error
}: {
  mode: "create" | "edit";
  properties: ListingPropertyOption[];
  units: ListingUnitOption[];
  values?: ListingFormValues;
  initialPropertyId?: string;
  initialUnitId?: string;
  error?: string;
}) {
  const initial = values;
  // In create mode, an explicit ?propertyId/?unitId (e.g. a "Create Listing"
  // link from a property or unit page) preselects the source and triggers
  // autofill on mount.
  const startPropertyId = initial?.propertyId ?? initialPropertyId ?? properties[0]?.id ?? "";
  const startUnitId = initial?.unitId ?? initialUnitId ?? "";
  const [propertyId, setPropertyId] = useState(startPropertyId);
  const [unitId, setUnitId] = useState(startUnitId);
  const [rent, setRent] = useState(initial?.rent ?? "");
  const [deposit, setDeposit] = useState(initial?.deposit ?? "");
  const [bedrooms, setBedrooms] = useState(initial?.bedrooms ?? "");
  const [bathrooms, setBathrooms] = useState(initial?.bathrooms ?? "");
  const [squareFeet, setSquareFeet] = useState(initial?.squareFeet ?? "");
  const [availabilityDate, setAvailabilityDate] = useState(initial?.availabilityDate ?? "");
  const [leaseTerms, setLeaseTerms] = useState(initial?.leaseTerms ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amenities, setAmenities] = useState(initial?.amenities ?? "");
  const [petPolicy, setPetPolicy] = useState(initial?.petPolicy ?? "");
  const [parking, setParking] = useState(initial?.parking ?? "");
  const [utilities, setUtilities] = useState(initial?.utilities ?? "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [photoUrls, setPhotoUrls] = useState<string[]>(initial?.photoUrls?.length ? initial.photoUrls : [""]);
  // Tracks whether the manager has been told the fields were prefilled.
  const [autofilled, setAutofilled] = useState(false);

  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === propertyId), [propertyId, units]);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const selectedUnit = units.find((unit) => unit.id === unitId);

  const suggestedPhotos = useMemo(() => {
    const fromUnit = selectedUnit?.photoUrls ?? [];
    const fromProperty = selectedProperty?.photoUrls ?? [];
    return Array.from(new Set([...fromUnit, ...fromProperty])).filter((url) => !photoUrls.includes(url));
  }, [selectedUnit, selectedProperty, photoUrls]);

  // Populate every editable field from the selected property + unit using the
  // shared listing-defaults helper, so create-from-property, create-from-unit,
  // and create-from-listings all behave identically. Fields stay editable.
  const applyDefaults = useCallback(
    (property: ListingPropertyOption | undefined, unit: ListingUnitOption | undefined) => {
      if (!property) return;
      const defaults = buildListingDefaultsFromPropertyUnit(property, unit);
      setRent(defaults.rent ? String(defaults.rent) : "");
      setDeposit(defaults.deposit ? String(defaults.deposit) : "");
      setBedrooms(unit ? String(defaults.bedrooms) : "");
      setBathrooms(defaults.bathrooms ? String(defaults.bathrooms) : "");
      setSquareFeet(defaults.squareFeet != null ? String(defaults.squareFeet) : "");
      setAvailabilityDate(defaults.availabilityDate ?? "");
      setLeaseTerms(defaults.leaseTerms ?? "");
      setDescription(defaults.description);
      setAmenities(defaults.amenities);
      setPetPolicy(defaults.petPolicy);
      setParking(defaults.parking);
      setUtilities(defaults.utilities);
      setContactName(defaults.contactName);
      setContactEmail(defaults.contactEmail);
      setContactPhone(defaults.contactPhone);
      setPhotoUrls(defaults.photoUrls.length ? defaults.photoUrls : [""]);
      setAutofilled(true);
    },
    []
  );

  // On mount in create mode, prefill from any preselected property/unit.
  useEffect(() => {
    if (mode !== "create") return;
    const property = properties.find((item) => item.id === startPropertyId);
    const unit = units.find((item) => item.id === startUnitId && item.propertyId === startPropertyId);
    applyDefaults(property, unit);
    // Run once on mount; selection changes are handled by the choose* handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseProperty(nextPropertyId: string) {
    setPropertyId(nextPropertyId);
    setUnitId("");
    if (mode === "create") {
      applyDefaults(properties.find((item) => item.id === nextPropertyId), undefined);
    }
  }

  function chooseUnit(nextUnitId: string) {
    setUnitId(nextUnitId);
    if (mode === "create") {
      const unit = units.find((item) => item.id === nextUnitId);
      applyDefaults(selectedProperty, unit);
    }
  }

  function updatePhoto(index: number, value: string) {
    setPhotoUrls((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addPhoto(value = "") {
    setPhotoUrls((current) => [...current, value]);
  }

  function removePhoto(index: number) {
    setPhotoUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  const photoCount = photoUrls.filter((url) => url.trim()).length;
  const readiness = [
    { ok: Boolean(selectedProperty), label: "Full property address" },
    { ok: Number(rent) > 0, label: "Rent" },
    { ok: bedrooms !== "", label: "Bedrooms" },
    { ok: Number(bathrooms) > 0, label: "Bathrooms" },
    { ok: Boolean(availabilityDate), label: "Availability date" },
    { ok: description.trim().length >= 20, label: "Description (20+ chars)" },
    { ok: Boolean(contactName.trim()), label: "Contact name" },
    { ok: /.+@.+\..+/.test(contactEmail.trim()), label: "Contact email" },
    { ok: Boolean(contactPhone.trim()), label: "Contact phone" },
    { ok: photoCount > 0, label: "At least one photo" }
  ];
  const readyCount = readiness.filter((item) => item.ok).length;
  const allReady = readyCount === readiness.length;

  if (!properties.length) {
    return (
      <Card className="p-8 text-center">
        <ImagePlus className="mx-auto h-8 w-8 text-[var(--brand)]" />
        <h2 className="mt-4 text-2xl font-semibold">Add a property first</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
          Listings are created from an existing property or unit in your portfolio.
        </p>
      </Card>
    );
  }

  return (
    <form action={mode === "create" ? createListingAction : updateListingAction} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {mode === "edit" && initial?.id ? <input type="hidden" name="listingId" value={initial.id} /> : null}

      <div className="space-y-4">
        {error ? <div className="rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">{error}</div> : null}
        {mode === "create" ? (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
            {autofilled
              ? "Listing details are prefilled from the selected property and unit. You can edit them before publishing."
              : "Pick a property and unit to prefill the listing from their saved details. You can edit everything before publishing."}
          </div>
        ) : null}

        <Card className="p-5 lg:p-6">
          <p className="section-kicker">Source</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Property &amp; unit</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Choose the property and (optionally) the unit this listing markets.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                <option value="">Whole property</option>
                {propertyUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>Unit {unit.unitNumber}</option>
                ))}
              </Select>
            </label>
          </div>
          {selectedProperty ? (
            <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--muted)]">
              {selectedProperty.formattedAddress}
            </div>
          ) : null}
        </Card>

        <Card className="p-5 lg:p-6">
          <p className="section-kicker">Pricing &amp; layout</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Listing details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <FieldLabel label="Monthly rent" />
              <Input name="rent" type="number" min="0" step="0.01" required value={rent} onChange={(event) => setRent(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel label="Deposit" />
              <Input name="deposit" type="number" min="0" step="0.01" value={deposit} onChange={(event) => setDeposit(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel label="Square feet" hint="Optional" />
              <Input name="squareFeet" type="number" min="0" step="1" value={squareFeet} onChange={(event) => setSquareFeet(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel label="Bedrooms" hint="0 = studio" />
              <Input name="bedrooms" type="number" min="0" step="1" required value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel label="Bathrooms" />
              <Input name="bathrooms" type="number" min="0" step="0.5" required value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel label="Available from" />
              <Input name="availabilityDate" type="date" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)} />
            </label>
          </div>
          <label className="mt-4 block">
            <FieldLabel label="Lease terms" hint="e.g. 12-month" />
            <Input name="leaseTerms" value={leaseTerms} onChange={(event) => setLeaseTerms(event.target.value)} placeholder="12-month lease, renewable" />
          </label>
          <label className="mt-4 block">
            <FieldLabel label="Description" hint="Shown to renters" />
            <Textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the home, the neighborhood, and what makes it a great rental." />
          </label>
        </Card>

        <Card className="p-5 lg:p-6">
          <p className="section-kicker">Marketing</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Amenities &amp; policies</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <FieldLabel label="Amenities" hint="Comma separated" />
              <Input name="amenities" value={amenities} onChange={(event) => setAmenities(event.target.value)} placeholder="In-unit laundry, Central AC, Dishwasher" />
            </label>
            <label className="block">
              <FieldLabel label="Pet policy" />
              <Input name="petPolicy" value={petPolicy} onChange={(event) => setPetPolicy(event.target.value)} placeholder="Cats and dogs welcome (deposit required)" />
            </label>
            <label className="block">
              <FieldLabel label="Parking" />
              <Input name="parking" value={parking} onChange={(event) => setParking(event.target.value)} placeholder="1 covered space included" />
            </label>
            <label className="block sm:col-span-2">
              <FieldLabel label="Utilities" />
              <Input name="utilities" value={utilities} onChange={(event) => setUtilities(event.target.value)} placeholder="Water and trash included; tenant pays electric" />
            </label>
          </div>
        </Card>

        <Card className="p-5 lg:p-6">
          <p className="section-kicker">Contact</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Leasing contact</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Shown publicly on syndicated listings. Use a leasing contact, not tenant details.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <FieldLabel label="Contact name" />
              <Input name="contactName" value={contactName} onChange={(event) => setContactName(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel label="Contact email" />
              <Input name="contactEmail" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel label="Contact phone" />
              <Input name="contactPhone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
            </label>
          </div>
        </Card>

        <Card className="p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Photos</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Listing photos</h2>
            </div>
            <Button type="button" variant="secondary" onClick={() => addPhoto()}>
              <Plus className="h-4 w-4" />
              Add URL
            </Button>
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Paste public image URLs. Only http(s) links and uploaded photo paths are accepted.</p>
          {suggestedPhotos.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedPhotos.slice(0, 8).map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => addPhoto(url)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--brand)]"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add property/unit photo
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {photoUrls.map((url, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input name="photoUrls" value={url} onChange={(event) => updatePhoto(index, event.target.value)} placeholder="https://… or /uploads/photo.jpg" />
                <Button type="button" variant="ghost" onClick={() => removePhoto(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5 lg:sticky lg:top-4">
          <p className="section-kicker">Feed readiness</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text)]">
            {readyCount} / {readiness.length} required fields
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            {allReady ? "This listing is ready to publish and syndicate." : "Complete every field below before publishing."}
          </p>
          <ul className="mt-4 space-y-2">
            {readiness.map((item) => (
              <ReadinessRow key={item.label} ok={item.ok} label={item.label} />
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-2">
            <Button type="submit" name="intent" value="draft" variant="secondary">
              {mode === "create" ? "Save draft" : "Save changes"}
            </Button>
            {mode === "create" ? (
              <Button type="submit" name="intent" value="publish" disabled={!allReady}>
                Save &amp; publish
              </Button>
            ) : null}
          </div>
          {mode === "create" && !allReady ? (
            <p className="mt-2 text-xs text-[var(--muted)]">Publishing unlocks once all required fields are complete.</p>
          ) : null}
        </Card>
      </div>
    </form>
  );
}
