import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { requireRoles } from "@/lib/auth";
import { publishListingAction, unpublishListingAction } from "@/lib/listing-actions";
import { getListingLocationLabel, getMissingFeedFields, managerOwnsListing } from "@/lib/listings";
import { readStore, UserRole } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";

const ALERTS: Record<string, { tone: "success" | "error"; message: string }> = {
  created: { tone: "success", message: "Listing created." },
  updated: { tone: "success", message: "Listing updated." },
  published: { tone: "success", message: "Listing published and added to your syndication feeds." },
  unpublished: { tone: "success", message: "Listing unpublished and removed from your feeds." },
  deleted: { tone: "success", message: "Listing deleted." }
};

export default async function ListingsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.ADMIN]);
  const params = (await searchParams) ?? {};
  const store = await readStore();

  const listings = store.listings
    .filter((listing) => managerOwnsListing(store, user, listing))
    .map((listing) => ({ listing, missing: getMissingFeedFields(store, listing) }))
    .sort((a, b) => b.listing.updatedAt.localeCompare(a.listing.updatedAt));

  const activeCount = listings.filter((row) => row.listing.status === "active").length;
  const draftCount = listings.filter((row) => row.listing.status === "draft").length;
  const incompleteCount = listings.filter((row) => row.missing.length > 0).length;
  const feedReadyCount = listings.filter((row) => row.missing.length === 0).length;

  const alert = params.error
    ? { tone: "error" as const, message: decodeURIComponent(params.error) }
    : Object.entries(ALERTS).find(([key]) => params[key])?.[1];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Syndication"
        title="Listings"
        description="Create, manage, and prepare rental listings for syndication."
        actions={
          <Link href="/listings/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
            <Plus className="h-4 w-4" />
            Create Listing
          </Link>
        }
      />

      {alert ? (
        <div className={`page-alert ${alert.tone === "error" ? "page-alert-error" : "page-alert-success"}`}>{alert.message}</div>
      ) : null}

      <section className="ops-grid">
        <StatCard label="Active listings" value={String(activeCount)} detail="Published in Nexus" tone={activeCount ? "success" : "default"} />
        <StatCard label="Draft listings" value={String(draftCount)} detail="Not yet published" tone={draftCount ? "warning" : "default"} />
        <StatCard label="Missing required fields" value={String(incompleteCount)} detail="Need attention before publishing" tone={incompleteCount ? "warning" : "default"} />
        <StatCard label="Feed-ready" value={String(feedReadyCount)} detail="Pass every syndication check" tone="brand" />
      </section>

      <DetailSection title="Listing register" description="Every draft and published listing in your portfolio, with feed readiness at a glance.">
        {listings.length ? (
          <DataTable
            className="mt-1"
            minWidth="72rem"
            columns={["Property / unit", "Rent", "Beds / baths", "Available", "Status", "Feed", "Missing", "Updated", ""]}
          >
            {listings.map(({ listing, missing }) => {
              const feedReady = missing.length === 0;
              return (
                <tr key={listing.id} className="table-row">
                  <td className="table-cell">
                    <Link href={`/listings/${listing.id}`} className="table-link font-semibold">{getListingLocationLabel(store, listing)}</Link>
                  </td>
                  <td className="table-cell font-semibold">{formatCurrency(listing.rent)}</td>
                  <td className="table-cell text-[var(--muted)]">{listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bd`} / {listing.bathrooms} ba</td>
                  <td className="table-cell text-[var(--muted)]">{listing.availabilityDate ? formatDate(listing.availabilityDate) : "—"}</td>
                  <td className="table-cell"><ListingStatusBadge status={listing.status} /></td>
                  <td className="table-cell">
                    {feedReady ? <Badge tone="success">Feed-ready</Badge> : <Badge tone="warning">Incomplete</Badge>}
                  </td>
                  <td className="table-cell text-[var(--muted)]">{missing.length ? `${missing.length} field${missing.length === 1 ? "" : "s"}` : "—"}</td>
                  <td className="table-cell text-[var(--muted)]">{formatDate(listing.updatedAt)}</td>
                  <td className="table-cell text-right">
                    <RowActionsMenu>
                      <RowActionLink href={`/listings/${listing.id}`}>View &amp; feed</RowActionLink>
                      <RowActionLink href={`/listings/${listing.id}/edit`}>Edit</RowActionLink>
                      {listing.status === "active" ? (
                        <form action={unpublishListingAction}>
                          <input type="hidden" name="listingId" value={listing.id} />
                          <button type="submit" className="row-action-item w-full text-left" role="menuitem">Unpublish</button>
                        </form>
                      ) : (
                        <form action={publishListingAction}>
                          <input type="hidden" name="listingId" value={listing.id} />
                          <button type="submit" className="row-action-item w-full text-left disabled:opacity-50" role="menuitem" disabled={!feedReady}>Publish</button>
                        </form>
                      )}
                    </RowActionsMenu>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <div className="mt-1">
            <EmptyState
              icon={Megaphone}
              title="No listings yet"
              description="Create your first rental listing from an existing property or unit."
              action={
                <Link href="/listings/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
                  <Plus className="h-4 w-4" />
                  Create Listing
                </Link>
              }
            />
          </div>
        )}
      </DetailSection>
    </div>
  );
}
