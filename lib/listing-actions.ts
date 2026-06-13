"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRoles } from "@/lib/auth";
import { dateOnlyToUtcNoonIso } from "@/lib/app-time";
import { managerOwnsListing, validateListingReadiness } from "@/lib/listings";
import { createId, nowIso, updateStore, UserRole, type Listing, type ListingStatus } from "@/lib/store";

const LISTING_ROLES = [UserRole.MANAGER, UserRole.ADMIN];

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalStr(formData: FormData, key: string) {
  return str(formData, key) || undefined;
}

function num(formData: FormData, key: string) {
  const value = Number(str(formData, key));
  return Number.isFinite(value) ? value : 0;
}

function optionalNum(formData: FormData, key: string) {
  const raw = str(formData, key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function optionalDate(formData: FormData, key: string) {
  const raw = str(formData, key);
  return raw ? dateOnlyToUtcNoonIso(raw) : undefined;
}

// Only accept http(s) URLs or root-relative app paths as photo sources. This
// keeps javascript:/data: URIs out of the preview and the public feeds.
function readPhotoUrls(formData: FormData) {
  const seen = new Set<string>();
  return formData
    .getAll("photoUrls")
    .map((value) => String(value).trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return /^https?:\/\//i.test(value) || value.startsWith("/");
    })
    .slice(0, 24);
}

function readListingForm(formData: FormData) {
  return {
    propertyId: str(formData, "propertyId"),
    unitId: optionalStr(formData, "unitId"),
    rent: num(formData, "rent"),
    deposit: num(formData, "deposit"),
    bedrooms: Math.max(0, Math.round(num(formData, "bedrooms"))),
    bathrooms: num(formData, "bathrooms"),
    squareFeet: optionalNum(formData, "squareFeet"),
    availabilityDate: optionalDate(formData, "availabilityDate"),
    leaseTerms: optionalStr(formData, "leaseTerms"),
    description: optionalStr(formData, "description"),
    amenities: optionalStr(formData, "amenities"),
    petPolicy: optionalStr(formData, "petPolicy"),
    parking: optionalStr(formData, "parking"),
    utilities: optionalStr(formData, "utilities"),
    contactName: optionalStr(formData, "contactName"),
    contactEmail: optionalStr(formData, "contactEmail"),
    contactPhone: optionalStr(formData, "contactPhone"),
    photoUrls: readPhotoUrls(formData)
  };
}

export async function createListingAction(formData: FormData) {
  const user = await requireRoles(LISTING_ROLES);
  const input = readListingForm(formData);
  const publishRequested = str(formData, "intent") === "publish";

  if (!input.propertyId) {
    redirect("/listings/new?error=invalid");
  }

  let listingId = "";
  let blockedPublish = false;

  try {
    await updateStore((store) => {
      const property = store.properties.find(
        (item) =>
          item.id === input.propertyId &&
          item.organizationId === user.organizationId &&
          (user.role === "ADMIN" || item.managerId === user.id)
      );
      if (!property) throw new Error("Property not found in your portfolio.");

      const unit = input.unitId ? store.units.find((item) => item.id === input.unitId && item.propertyId === property.id) : null;
      if (input.unitId && !unit) throw new Error("Unit not found for this property.");

      const now = nowIso();
      const id = createId("listing");
      listingId = id;
      const listing: Listing = {
        id,
        organizationId: user.organizationId,
        managerUserId: user.id,
        propertyId: property.id,
        unitId: unit?.id,
        status: "draft",
        ...input,
        photoUrls: input.photoUrls,
        createdAt: now,
        updatedAt: now
      };

      const ready = validateListingReadiness(store, listing).ready;
      if (publishRequested && ready) {
        listing.status = "active";
        listing.publishedAt = now;
      } else if (publishRequested && !ready) {
        blockedPublish = true;
      }

      return { ...store, listings: [...store.listings, listing] };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the listing.";
    redirect(`/listings/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/listings");
  redirect(`/listings/${listingId}?created=1${blockedPublish ? "&incomplete=1" : ""}`);
}

export async function updateListingAction(formData: FormData) {
  const user = await requireRoles(LISTING_ROLES);
  const listingId = str(formData, "listingId");
  const input = readListingForm(formData);

  if (!listingId || !input.propertyId) {
    redirect(`/listings/${listingId}/edit?error=invalid`);
  }

  try {
    await updateStore((store) => {
      const existing = store.listings.find((item) => item.id === listingId);
      if (!existing || !managerOwnsListing(store, user, existing)) {
        throw new Error("Listing not found.");
      }
      const property = store.properties.find(
        (item) =>
          item.id === input.propertyId &&
          item.organizationId === user.organizationId &&
          (user.role === "ADMIN" || item.managerId === user.id)
      );
      if (!property) throw new Error("Property not found in your portfolio.");
      const unit = input.unitId ? store.units.find((item) => item.id === input.unitId && item.propertyId === property.id) : null;
      if (input.unitId && !unit) throw new Error("Unit not found for this property.");

      const next: Listing = {
        ...existing,
        ...input,
        propertyId: property.id,
        unitId: unit?.id,
        photoUrls: input.photoUrls,
        updatedAt: nowIso()
      };

      // An active listing that loses a required field is automatically pulled
      // back to unpublished so the public feeds never serve incomplete data.
      if (next.status === "active" && !validateListingReadiness(store, next).ready) {
        next.status = "unpublished";
      }

      return { ...store, listings: store.listings.map((item) => (item.id === listingId ? next : item)) };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the listing.";
    redirect(`/listings/${listingId}/edit?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
  redirect(`/listings/${listingId}?updated=1`);
}

async function setListingStatus(formData: FormData, status: ListingStatus) {
  const user = await requireRoles(LISTING_ROLES);
  const listingId = str(formData, "listingId");
  let blocked = false;

  try {
    await updateStore((store) => {
      const existing = store.listings.find((item) => item.id === listingId);
      if (!existing || !managerOwnsListing(store, user, existing)) {
        throw new Error("Listing not found.");
      }

      // Publishing is fail-closed: a listing missing any required field cannot
      // go active, mirroring the readiness gate shown in the UI.
      if (status === "active" && !validateListingReadiness(store, existing).ready) {
        blocked = true;
        return store;
      }

      const now = nowIso();
      const next: Listing = {
        ...existing,
        status,
        publishedAt: status === "active" ? existing.publishedAt ?? now : existing.publishedAt,
        updatedAt: now
      };
      return { ...store, listings: store.listings.map((item) => (item.id === listingId ? next : item)) };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the listing.";
    redirect(`/listings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
  redirect(`/listings/${listingId}?${blocked ? "incomplete=1" : status === "active" ? "published=1" : "unpublished=1"}`);
}

export async function publishListingAction(formData: FormData) {
  await setListingStatus(formData, "active");
}

export async function unpublishListingAction(formData: FormData) {
  await setListingStatus(formData, "unpublished");
}

export async function deleteListingAction(formData: FormData) {
  const user = await requireRoles(LISTING_ROLES);
  const listingId = str(formData, "listingId");

  try {
    await updateStore((store) => {
      const existing = store.listings.find((item) => item.id === listingId);
      if (!existing || !managerOwnsListing(store, user, existing)) {
        throw new Error("Listing not found.");
      }
      return { ...store, listings: store.listings.filter((item) => item.id !== listingId) };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete the listing.";
    redirect(`/listings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/listings");
  redirect("/listings?deleted=1");
}
