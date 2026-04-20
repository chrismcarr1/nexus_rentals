import Link from "next/link";
import { notFound } from "next/navigation";

import { SingleUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createUnitAction } from "@/lib/actions";
import { requireRouteAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, parseTags } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function PropertyDetailPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
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

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
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
            <p className="text-sm text-stone-500">{property.addressLine1}, {property.city}, {property.state} {property.postalCode}</p>
            <p className="mt-6 text-4xl font-semibold">{property.units.length}</p>
            <p className="text-sm text-stone-500">units in this asset</p>
            <p className="mt-6 text-xl font-semibold">{formatCurrency(property.units.reduce((sum, unit) => sum + unit.monthlyRent, 0))}/month</p>
            <p className="text-sm text-stone-500">scheduled monthly rent</p>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
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
      </section>
    </div>
  );
}
