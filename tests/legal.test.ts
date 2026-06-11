import { describe, expect, it } from "vitest";

import {
  PAYMENT_TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_VERSION,
  calculateAge,
  hasAcceptedCurrentLegalTerms,
  hasAcceptedCurrentPaymentTerms,
  hasVerifiedAdultBirthDate,
  isValidBirthDate,
  requiresLegalAcceptance,
  validateBirthDateInput
} from "../lib/legal";

const NOW = new Date("2026-06-11T12:00:00.000Z");

function acceptedUser(overrides: Record<string, string | undefined> = {}) {
  return {
    birthDate: "1990-01-15",
    ageVerifiedAt: "2026-06-11T00:00:00.000Z",
    termsAcceptedAt: "2026-06-11T00:00:00.000Z",
    termsVersionAccepted: TERMS_VERSION,
    privacyAcceptedAt: "2026-06-11T00:00:00.000Z",
    privacyVersionAccepted: PRIVACY_VERSION,
    ...overrides
  };
}

describe("birth date validation", () => {
  it("accepts a valid adult birth date", () => {
    expect(validateBirthDateInput("1990-01-15", NOW)).toEqual({ ok: true, birthDate: "1990-01-15" });
  });

  it("rejects a missing birth date", () => {
    expect(validateBirthDateInput("", NOW)).toEqual({ ok: false, error: "missing-birthdate" });
    expect(validateBirthDateInput(undefined, NOW)).toEqual({ ok: false, error: "missing-birthdate" });
  });

  it("rejects malformed and impossible dates", () => {
    expect(validateBirthDateInput("not-a-date", NOW)).toEqual({ ok: false, error: "invalid-birthdate" });
    expect(validateBirthDateInput("2000-02-30", NOW)).toEqual({ ok: false, error: "invalid-birthdate" });
    expect(validateBirthDateInput("1899-12-31", NOW)).toEqual({ ok: false, error: "invalid-birthdate" });
    expect(validateBirthDateInput("15-01-1990", NOW)).toEqual({ ok: false, error: "invalid-birthdate" });
  });

  it("rejects future dates", () => {
    expect(validateBirthDateInput("2027-01-01", NOW)).toEqual({ ok: false, error: "invalid-birthdate" });
  });

  it("rejects under-18 users, including the day before their 18th birthday", () => {
    expect(validateBirthDateInput("2010-06-11", NOW)).toEqual({ ok: false, error: "underage" });
    expect(validateBirthDateInput("2008-06-12", NOW)).toEqual({ ok: false, error: "underage" });
  });

  it("accepts someone turning 18 today", () => {
    expect(validateBirthDateInput("2008-06-11", NOW)).toEqual({ ok: true, birthDate: "2008-06-11" });
  });

  it("computes ages around birthday boundaries", () => {
    expect(calculateAge("2008-06-11", NOW)).toBe(18);
    expect(calculateAge("2008-06-12", NOW)).toBe(17);
    expect(calculateAge("1990-01-15", NOW)).toBe(36);
    expect(calculateAge("bogus", NOW)).toBeNull();
  });

  it("validates dates structurally", () => {
    expect(isValidBirthDate("2000-02-29", NOW)).toBe(true);
    expect(isValidBirthDate("2001-02-29", NOW)).toBe(false);
  });
});

describe("legal acceptance checks", () => {
  it("passes a fully accepted adult user", () => {
    expect(hasAcceptedCurrentLegalTerms(acceptedUser())).toBe(true);
    expect(requiresLegalAcceptance(acceptedUser())).toBe(false);
  });

  it("requires acceptance for a user with no metadata (existing users)", () => {
    expect(requiresLegalAcceptance({})).toBe(true);
  });

  it("requires re-acceptance when the terms version is bumped", () => {
    expect(requiresLegalAcceptance(acceptedUser({ termsVersionAccepted: "2020-01-01" }))).toBe(true);
    expect(requiresLegalAcceptance(acceptedUser({ privacyVersionAccepted: "2020-01-01" }))).toBe(true);
  });

  it("requires acceptance when timestamps are missing", () => {
    expect(requiresLegalAcceptance(acceptedUser({ termsAcceptedAt: undefined }))).toBe(true);
    expect(requiresLegalAcceptance(acceptedUser({ privacyAcceptedAt: undefined }))).toBe(true);
  });

  it("requires acceptance when age verification is missing or invalid", () => {
    expect(requiresLegalAcceptance(acceptedUser({ ageVerifiedAt: undefined }))).toBe(true);
    expect(requiresLegalAcceptance(acceptedUser({ birthDate: undefined }))).toBe(true);
    expect(requiresLegalAcceptance(acceptedUser({ birthDate: "not-a-date" }))).toBe(true);
  });

  it("treats an underage stored birth date as unverified", () => {
    const thisYear = new Date().getUTCFullYear();
    expect(hasVerifiedAdultBirthDate(acceptedUser({ birthDate: `${thisYear - 10}-01-01` }))).toBe(false);
  });
});

describe("payment terms acceptance", () => {
  it("requires both timestamp and current version", () => {
    expect(hasAcceptedCurrentPaymentTerms({})).toBe(false);
    expect(hasAcceptedCurrentPaymentTerms({ paymentTermsAcceptedAt: "2026-06-11T00:00:00.000Z" })).toBe(false);
    expect(
      hasAcceptedCurrentPaymentTerms({
        paymentTermsAcceptedAt: "2026-06-11T00:00:00.000Z",
        paymentTermsVersionAccepted: PAYMENT_TERMS_VERSION
      })
    ).toBe(true);
    expect(
      hasAcceptedCurrentPaymentTerms({
        paymentTermsAcceptedAt: "2026-06-11T00:00:00.000Z",
        paymentTermsVersionAccepted: "2020-01-01"
      })
    ).toBe(false);
  });
});
