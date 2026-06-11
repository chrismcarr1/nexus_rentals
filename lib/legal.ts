// Central legal-document versions and acceptance/age-verification helpers.
// This module must stay dependency-free (no "server-only", no store imports)
// so it can be used from server actions, layouts, middleware, and pages alike.
// Bumping a version constant forces every user back through /legal/accept.

export const TERMS_VERSION = "2026-06-11";
export const PRIVACY_VERSION = "2026-06-11";
export const PAYMENT_TERMS_VERSION = "2026-06-11";

export const MINIMUM_ACCOUNT_AGE = 18;

// Single source for support/privacy contact addresses used on legal pages.
export const SUPPORT_EMAIL = "support@nexusrentals.com";
export const PRIVACY_EMAIL = SUPPORT_EMAIL;

export const LEGAL_ACCEPT_PATH = "/legal/accept";

export type LegalAcceptanceUser = {
  birthDate?: string;
  ageVerifiedAt?: string;
  termsAcceptedAt?: string;
  termsVersionAccepted?: string;
  privacyAcceptedAt?: string;
  privacyVersionAccepted?: string;
  paymentTermsAcceptedAt?: string;
  paymentTermsVersionAccepted?: string;
};

type ParsedBirthDate = { year: number; month: number; day: number };

// Strict YYYY-MM-DD parsing. Round-trips through Date.UTC so impossible dates
// (e.g. 2000-02-30) are rejected instead of silently rolling over.
function parseBirthDate(value: string | undefined | null): ParsedBirthDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function isValidBirthDate(value: string | undefined | null, at: Date = new Date()): boolean {
  const parsed = parseBirthDate(value);
  if (!parsed) return false;
  const birthUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  return birthUtc <= at.getTime();
}

export function calculateAge(value: string | undefined | null, at: Date = new Date()): number | null {
  const parsed = parseBirthDate(value);
  if (!parsed) return null;
  let age = at.getUTCFullYear() - parsed.year;
  const monthDiff = at.getUTCMonth() + 1 - parsed.month;
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < parsed.day)) {
    age -= 1;
  }
  return age;
}

export type BirthDateValidation =
  | { ok: true; birthDate: string }
  | { ok: false; error: "missing-birthdate" | "invalid-birthdate" | "underage" };

// Server-side birthday validation shared by signup and the acceptance gate.
// Future and impossible dates are both reported as invalid.
export function validateBirthDateInput(value: string | undefined | null, at: Date = new Date()): BirthDateValidation {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { ok: false, error: "missing-birthdate" };
  if (!isValidBirthDate(trimmed, at)) return { ok: false, error: "invalid-birthdate" };
  const age = calculateAge(trimmed, at);
  if (age === null) return { ok: false, error: "invalid-birthdate" };
  if (age < MINIMUM_ACCOUNT_AGE) return { ok: false, error: "underage" };
  return { ok: true, birthDate: trimmed };
}

// True when the user record carries a verified, valid, 18+ birth date.
export function hasVerifiedAdultBirthDate(user: LegalAcceptanceUser): boolean {
  if (!user.ageVerifiedAt || !user.birthDate) return false;
  if (!isValidBirthDate(user.birthDate)) return false;
  const age = calculateAge(user.birthDate);
  return age !== null && age >= MINIMUM_ACCOUNT_AGE;
}

export function hasAcceptedCurrentLegalTerms(user: LegalAcceptanceUser): boolean {
  return (
    user.termsVersionAccepted === TERMS_VERSION &&
    user.privacyVersionAccepted === PRIVACY_VERSION &&
    Boolean(user.termsAcceptedAt) &&
    Boolean(user.privacyAcceptedAt) &&
    hasVerifiedAdultBirthDate(user)
  );
}

// Gate predicate used by requireUser() and the /legal/accept page.
export function requiresLegalAcceptance(user: LegalAcceptanceUser): boolean {
  return !hasAcceptedCurrentLegalTerms(user);
}

export function hasAcceptedCurrentPaymentTerms(user: LegalAcceptanceUser): boolean {
  return user.paymentTermsVersionAccepted === PAYMENT_TERMS_VERSION && Boolean(user.paymentTermsAcceptedAt);
}
