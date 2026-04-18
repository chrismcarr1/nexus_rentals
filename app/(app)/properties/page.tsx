import Link from "next/link";

import { SingleUploadInput } from "@/components/upload-inputs";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createPropertyAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, parseTags } from "@/lib/utils";

export default async function PropertiesPage() {
  const user = await requireUser();
  const properties = await db.property.findMany({
    where: { organizationId: user.organizationId },
    include: { units: true, files: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="grid gap-4 md:grid-cols-2">
        {properties.map((property) => (
          <Link key={property.id} href={`/properties/${property.id}`}>
            <Card className="h-full overflow-hidden">
              <div className="h-44 bg-[linear-gradient(135deg,#184c45,#2d756b)] p-5 text-white">
                <p className="text-sm uppercase tracking-[0.22em] text-white/70">Property</p>
                <h2 className="mt-3 font-[var(--font-display)] text-3xl">{property.name}</h2>
                <p className="mt-3 text-sm text-white/80">{property.city}, {property.state}</p>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-stone-500">{property.units.length} units</p>
                  <p className="text-sm font-semibold">
                    {formatCurrency(property.units.reduce((sum, unit) => sum + unit.monthlyRent, 0))}/mo
                  </p>
                </div>
                <p className="mt-4 text-sm text-stone-600">{property.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {parseTags(property.amenities).slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded-full bg-stone-900/5 px-3 py-1 text-xs font-semibold text-stone-600">{tag}</span>
                  ))}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Add Property</p>
        <h2 className="mt-2 text-2xl font-semibold">Create a new asset</h2>
        <form action={createPropertyAction} className="mt-6 space-y-4">
          <input name="name" placeholder="Property name" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="addressLine1" placeholder="Address line 1" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <div className="grid gap-4 md:grid-cols-3">
            <input name="city" placeholder="City" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="state" placeholder="State" maxLength={2} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
            <input name="postalCode" placeholder="Zip" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </div>
          <textarea name="description" placeholder="Asset summary" className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="amenities" placeholder="Amenities, comma separated" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <SingleUploadInput name="imagePath" label="Upload property cover image" />
          <SubmitButton>Save property</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
