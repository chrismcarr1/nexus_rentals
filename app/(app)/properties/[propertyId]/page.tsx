import Link from "next/link";
import { notFound } from "next/navigation";

import { AddressFields } from "@/components/address-fields";
import { MultiUploadInput, SingleUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createUnitAction, deletePropertyAction, updatePropertyAction } from "@/lib/actions";
import { formatAddress } from "@/lib/address";
import { requireRouteAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, parseTags } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function PropertyDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ propertyId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const { propertyId } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireRouteAccess("/properties");
  const portal = await getPortalContext(user);
  const property = await db.property.findFirst({
    where: { id: propertyId, organizationId: user.organizationId },
    include: {
      units: {
        include: {
          leases: true,
          files: true
        }
      },
      expenses: { orderBy: { incurredAt: "desc" }, take: 5 },
      maintenance: { orderBy: { requestedAt: "desc" }, take: 5 }
    }
  });

  if (!property || !portal.scope.properties.some((item) => item.id === property.id)) notFound();

  const imageTimestamp = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
  const propertyImages = [...(property.files ?? [])]
    .filter((file: any) => file.kind === "PROPERTY_IMAGE")
    .sort((a: any, b: any) => imageTimestamp(b.createdAt).localeCompare(imageTimestamp(a.createdAt)));
  const coverImage = propertyImages[0];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {coverImage ? (
          <div className="h-72 overflow-hidden bg-stone-900/5">
            <img src={coverImage.path} alt={coverImage.label ?? `${property.name} property photo`} className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Property detail</p>
            <h1 className="mt-3 font-[var(--font-display)] text-5xl">{property.name}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">{property.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {parseTags(property.amenities).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] bg-stone-900/5 p-5">
            <p className="text-sm text-stone-500">{formatAddress(property)}</p>
            <p className="mt-6 text-4xl font-semibold">{property.units.length}</p>
            <p className="text-sm text-stone-500">units in this asset</p>
            <p className="mt-6 text-xl font-semibold">{formatCurrency(property.units.reduce((sum, unit) => sum + unit.monthlyRent, 0))}/month</p>
            <p className="text-sm text-stone-500">scheduled monthly rent</p>
            {propertyImages.length > 1 ? (
              <div className="mt-5 grid grid-cols-3 gap-2">
                {propertyImages.slice(1, 4).map((file: any) => (
                  <img key={file.id} src={file.path} alt={file.label ?? `${property.name} property photo`} className="aspect-square rounded-2xl object-cover" />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Edit property</p>
            <h2 className="mt-2 text-2xl font-semibold">Update property details</h2>
            {query.error ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {query.error === "invalid-address"
                  ? "Enter a complete property address with street, city, state, ZIP or postal code, and country."
                  : "Review the property details and try again."}
              </div>
            ) : null}
            <form action={updatePropertyAction} className="mt-6 space-y-4">
              <input type="hidden" name="propertyId" value={property.id} />
              <input name="name" defaultValue={property.name} placeholder="Property name" className="field" />
              <AddressFields defaultValue={property} />
              <textarea name="description" defaultValue={property.description ?? ""} placeholder="Asset summary" className="field min-h-24" />
              <input name="amenities" defaultValue={property.amenities} placeholder="Amenities, comma separated" className="field" />
              <textarea name="notes" defaultValue={property.notes ?? ""} placeholder="Internal notes" className="field min-h-24" />
              {user.role === "ADMIN" ? (
                <select name="managerId" defaultValue={property.managerId ?? ""} className="field">
                  <option value="">Unassigned manager</option>
                  {portal.managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.firstName} {manager.lastName}
                    </option>
                  ))}
                </select>
              ) : null}
              <MultiUploadInput name="imagePaths" label="Add property photos" accept="image/*" />
              <SubmitButton>Save changes</SubmitButton>
            </form>
          </Card>

          <Card className="p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--danger)]">Danger zone</p>
            <h2 className="mt-2 text-2xl font-semibold">Delete this property</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              This permanently removes the property and its units, leases, payments, expenses, maintenance, inspections, assessments, and uploaded files.
            </p>
            <form action={deletePropertyAction} className="mt-5 space-y-4">
              <input type="hidden" name="propertyId" value={property.id} />
              <label className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-white/70 p-4 text-sm text-[var(--muted)]">
                <input type="checkbox" name="confirmDelete" value="yes" required className="mt-1" />
                <span>I understand this cannot be undone.</span>
              </label>
              <SubmitButton variant="danger" pendingLabel="Deleting...">Delete property</SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Units</p>
              <h2 className="mt-2 text-2xl font-semibold">Asset inventory</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {property.units.map((unit) => (
              <Link key={unit.id} href={`/units/${unit.id}`}>
                <div className="rounded-[26px] border border-[var(--line)] bg-white/70 p-5 transition hover:bg-white">
                  <div className="flex items-center justify-between">
                    <p className="text-xl font-semibold">{unit.unitNumber}</p>
                    <Badge tone={unit.occupancyStatus === "OCCUPIED" ? "success" : unit.occupancyStatus === "VACANT" ? "warning" : "default"}>{unit.occupancyStatus}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-stone-500">{unit.nickname || unit.unitType}</p>
                  <p className="mt-4 text-lg font-semibold">{formatCurrency(unit.monthlyRent)}/mo</p>
                  <p className="text-sm text-stone-500">{unit.bedrooms} bd / {unit.bathrooms} ba / {unit.squareFeet ?? "n/a"} sf</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Add unit</p>
          <h2 className="mt-2 text-2xl font-semibold">Extend this property</h2>
          <form action={createUnitAction} className="mt-6 space-y-4">
            <input type="hidden" name="propertyId" value={property.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <input name="unitNumber" placeholder="Unit number" className="field" />
              <input name="nickname" placeholder="Nickname" className="field" />
            </div>
            <input name="unitType" placeholder="Unit type" className="field" />
            <div className="grid gap-4 md:grid-cols-3">
              <input name="bedrooms" type="number" step="1" placeholder="Bedrooms" className="field" />
              <input name="bathrooms" type="number" step="0.5" placeholder="Bathrooms" className="field" />
              <input name="squareFeet" type="number" step="1" placeholder="Sq ft" className="field" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input name="monthlyRent" type="number" step="0.01" placeholder="Monthly rent" className="field" />
              <input name="depositAmount" type="number" step="0.01" placeholder="Deposit" className="field" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <select name="occupancyStatus" className="field">
                <option value="VACANT">Vacant</option>
                <option value="OCCUPIED">Occupied</option>
                <option value="NOTICE">Notice</option>
                <option value="TURNOVER">Turnover</option>
              </select>
              <select name="leaseStatus" className="field">
                <option value="UPCOMING">Upcoming</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </div>
            <textarea name="amenities" placeholder="Amenities, comma separated" className="field min-h-24" />
            <SingleUploadInput name="imagePath" label="Upload unit image" />
            <SubmitButton>Create unit</SubmitButton>
          </form>
        </Card>
        </div>
      </section>
    </div>
  );
}
