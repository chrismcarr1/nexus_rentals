import { Bath, BedDouble, CalendarClock, Mail, MapPin, Phone, Ruler, User } from "lucide-react";

import { PhotoCarousel } from "@/components/photo-carousel";
import { Badge } from "@/components/ui/badge";
import type { RentalListingFeedItem } from "@/lib/syndication/listing-feed";
import { formatCurrency, formatDate } from "@/lib/utils";

// Renders the public-facing preview of a listing exactly as it would appear in
// a syndicated feed item. Used on the listing detail page.
export function ListingPreview({ item }: { item: RentalListingFeedItem }) {
  const photos = item.photoUrls.map((url, index) => ({ id: `${item.listingId}-${index}`, path: url, displayName: `Photo ${index + 1}` }));
  const bedLabel = item.bedrooms === 0 ? "Studio" : `${item.bedrooms} bed${item.bedrooms === 1 ? "" : "s"}`;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      {photos.length ? (
        <PhotoCarousel photos={photos} height="h-64" label="Listing photos" />
      ) : (
        <div className="flex h-48 items-center justify-center bg-[var(--surface)] text-sm text-[var(--muted)]">No photos added yet</div>
      )}
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--text)]">{item.title}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--muted)]">
              <MapPin className="h-4 w-4 shrink-0" />
              {item.address || "Address unavailable"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-[var(--text)]">{formatCurrency(item.rent)}<span className="text-sm font-normal text-[var(--muted)]">/mo</span></p>
            {item.deposit ? <p className="text-xs text-[var(--muted)]">{formatCurrency(item.deposit)} deposit</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--text)]">
          <span className="flex items-center gap-1.5"><BedDouble className="h-4 w-4 text-[var(--muted)]" />{bedLabel}</span>
          <span className="flex items-center gap-1.5"><Bath className="h-4 w-4 text-[var(--muted)]" />{item.bathrooms} bath{item.bathrooms === 1 ? "" : "s"}</span>
          {item.squareFeet ? <span className="flex items-center gap-1.5"><Ruler className="h-4 w-4 text-[var(--muted)]" />{item.squareFeet.toLocaleString()} sq ft</span> : null}
          {item.availabilityDate ? <span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-[var(--muted)]" />Available {formatDate(item.availabilityDate)}</span> : null}
        </div>

        {item.description ? <p className="text-sm leading-6 text-[var(--muted-strong)]">{item.description}</p> : null}

        {item.amenities.length ? (
          <div className="flex flex-wrap gap-1.5">
            {item.amenities.map((amenity) => (
              <Badge key={amenity} tone="brand">{amenity}</Badge>
            ))}
          </div>
        ) : null}

        {(item.petPolicy || item.parking || item.utilities || item.leaseTerms) ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {item.leaseTerms ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Lease terms</dt><dd className="mt-0.5 text-sm text-[var(--text)]">{item.leaseTerms}</dd></div> : null}
            {item.petPolicy ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Pet policy</dt><dd className="mt-0.5 text-sm text-[var(--text)]">{item.petPolicy}</dd></div> : null}
            {item.parking ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Parking</dt><dd className="mt-0.5 text-sm text-[var(--text)]">{item.parking}</dd></div> : null}
            {item.utilities ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Utilities</dt><dd className="mt-0.5 text-sm text-[var(--text)]">{item.utilities}</dd></div> : null}
          </dl>
        ) : null}

        {(item.contactName || item.contactEmail || item.contactPhone) ? (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Leasing contact</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--text)]">
              {item.contactName ? <span className="flex items-center gap-1.5"><User className="h-4 w-4 text-[var(--muted)]" />{item.contactName}</span> : null}
              {item.contactEmail ? <span className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-[var(--muted)]" />{item.contactEmail}</span> : null}
              {item.contactPhone ? <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-[var(--muted)]" />{item.contactPhone}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
