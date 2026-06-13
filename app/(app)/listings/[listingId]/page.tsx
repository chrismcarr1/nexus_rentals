import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Pencil } from "lucide-react";

import { DetailSection } from "@/components/detail-section";
import { ListingFeedTools } from "@/components/listings/listing-feed-tools";
import { ListingPreview } from "@/components/listings/listing-preview";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireRoles } from "@/lib/auth";
import { deleteListingAction, publishListingAction, unpublishListingAction } from "@/lib/listing-actions";
import { getListingsFeedToken } from "@/lib/listings-feed-auth";
import { FEED_REQUIRED_FIELDS, getListingLocationLabel, getMissingFeedFields, managerOwnsListing } from "@/lib/listings";
import { buildAppUrl } from "@/lib/request-origin";
import { listingToFeedItem } from "@/lib/syndication/listing-feed";
import { readStore, UserRole } from "@/lib/store";
import { formatDate } from "@/lib/utils";

const DETAIL_ALERTS: Record<string, { tone: "success" | "warning" | "error"; message: string }> = {
  created: { tone: "success", message: "Listing created. Complete any missing fields below, then publish." },
  updated: { tone: "success", message: "Listing updated." },
  published: { tone: "success", message: "Listing published and added to your syndication feeds." },
  unpublished: { tone: "success", message: "Listing unpublished and removed from your feeds." },
  incomplete: { tone: "warning", message: "This listing is missing required fields and cannot be published until they are complete." }
};

const ALERT_CLASS = { success: "page-alert-success", warning: "page-alert-warning", error: "page-alert-error" } as const;

function feedUrl(path: string, token: string) {
  const query = token ? { token } : undefined;
  try {
    return buildAppUrl(path, query);
  } catch {
    return token ? `${path}?token=${encodeURIComponent(token)}` : path;
  }
}

export default async function ListingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ listingId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.ADMIN]);
  const { listingId } = await params;
  const query = (await searchParams) ?? {};
  const store = await readStore();
  const listing = store.listings.find((item) => item.id === listingId);
  if (!listing || !managerOwnsListing(store, user, listing)) {
    notFound();
  }

  const missing = getMissingFeedFields(store, listing);
  const feedReady = missing.length === 0;
  const item = listingToFeedItem(store, listing);
  const missingSet = new Set(missing);
  const feedToken = getListingsFeedToken();

  const alert = query.error
    ? { tone: "error" as const, message: decodeURIComponent(query.error) }
    : Object.entries(DETAIL_ALERTS).find(([key]) => query[key])?.[1];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Listing"
        title={getListingLocationLabel(store, listing)}
        description="Preview, validate, publish, and access syndication feeds for this listing."
        breadcrumbs={
          <span className="flex items-center gap-2">
            <Link href="/listings" className="hover:text-[var(--text)]">Listings</Link>
            <span className="breadcrumb-sep">/</span>
            <ListingStatusBadge status={listing.status} />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/listings/${listing.id}/edit`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]">
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            {listing.status === "active" ? (
              <form action={unpublishListingAction}>
                <input type="hidden" name="listingId" value={listing.id} />
                <Button type="submit" variant="secondary">Unpublish</Button>
              </form>
            ) : (
              <form action={publishListingAction}>
                <input type="hidden" name="listingId" value={listing.id} />
                <Button type="submit" disabled={!feedReady}>Publish</Button>
              </form>
            )}
            <form action={deleteListingAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <Button type="submit" variant="ghost">Delete</Button>
            </form>
          </div>
        }
      />

      {alert ? <div className={`page-alert ${ALERT_CLASS[alert.tone]}`}>{alert.message}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DetailSection title="Listing preview" description="Exactly how this listing appears in a syndicated feed item.">
          <ListingPreview item={item} />
        </DetailSection>

        <div className="space-y-4">
          <DetailSection title="Feed readiness" description={feedReady ? "All required fields are complete." : `${missing.length} required field${missing.length === 1 ? "" : "s"} missing.`}>
            <ul className="space-y-2">
              {FEED_REQUIRED_FIELDS.map((field) => {
                const ok = !missingSet.has(field.label);
                return (
                  <li key={field.key} className="flex items-center gap-2 text-sm">
                    {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-amber-600" />}
                    <span className={ok ? "text-[var(--text)]" : "text-[var(--muted)]"}>{field.label}</span>
                  </li>
                );
              })}
            </ul>
            {!feedReady ? (
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                Publishing is blocked until every field is complete. <Link href={`/listings/${listing.id}/edit`} className="table-link font-semibold">Edit listing</Link>.
              </p>
            ) : null}
          </DetailSection>

          <DetailSection title="Syndication feeds" description="Hosted feed URLs for partner approval and syndication.">
            <ListingFeedTools
              genericUrl={feedUrl("/api/listings/feed/generic.json", feedToken)}
              zillowUrl={feedUrl("/api/listings/feed/zillow.xml", feedToken)}
              tokenConfigured={Boolean(feedToken)}
            />
            {!feedReady || listing.status !== "active" ? (
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                This listing is {listing.status === "active" ? "active" : "not active"} and {feedReady ? "feed-ready" : "incomplete"}. Only active, feed-ready listings appear in the feeds above.
              </p>
            ) : null}
          </DetailSection>

          <DetailSection title="Details" description="Internal record metadata.">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Created</dt><dd className="mt-0.5 text-[var(--text)]">{formatDate(listing.createdAt)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Updated</dt><dd className="mt-0.5 text-[var(--text)]">{formatDate(listing.updatedAt)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Published</dt><dd className="mt-0.5 text-[var(--text)]">{listing.publishedAt ? formatDate(listing.publishedAt) : "—"}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Photos</dt><dd className="mt-0.5 text-[var(--text)]">{listing.photoUrls.length}</dd></div>
            </dl>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
