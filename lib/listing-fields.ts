import { formatPhoneNumber, phoneDigits } from "@/lib/phone";

// Shared rules for the public-facing listing fields that appear in syndication
// feeds. Kept free of "server-only" so both the server readiness check
// (lib/listings.ts) and the client listing editor enforce identical thresholds.

// Minimum description length for a feed-ready, professional listing. Short
// blurbs read as low quality on Zillow/Apartments.com, so they are blocked.
export const LISTING_DESCRIPTION_MIN_LENGTH = 80;

export function isValidPublicListingEmail(value?: string | null): boolean {
  const email = (value ?? "").trim();
  if (!email) return false;
  // Pragmatic check: a single local part, an @, and a dotted domain, no spaces.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// US phone validity: exactly 10 national digits once punctuation/country code
// are stripped (phoneDigits handles a leading 1).
export function isValidPublicListingPhone(value?: string | null): boolean {
  return phoneDigits(value).length === 10;
}

// Clean, human-readable phone for public feeds, e.g. "(630) 414-5868".
// Falls back to the original trimmed value if it is not a normalizable US
// number so a partner still receives whatever the manager entered.
export function normalizePublicListingPhone(value?: string | null): string {
  const formatted = formatPhoneNumber(value);
  return formatted || (value ?? "").trim();
}

// Split a stored amenities string into clean, separate items. Accepts commas,
// semicolons, and newlines as separators, trims each item, drops blanks, and
// removes case-insensitive duplicates while preserving first-seen order.
export function splitListingAmenities(value?: string | null): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of (value ?? "").split(/[,;\n]/)) {
    const item = part.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
