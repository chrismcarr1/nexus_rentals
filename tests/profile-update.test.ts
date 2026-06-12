import { describe, expect, it } from "vitest";

import { applyOwnProfileUpdate, ProfileUpdateError } from "@/lib/profile";
import type { User } from "@/lib/store";

const now = new Date("2026-06-12T12:00:00.000Z");

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user_1",
    organizationId: "org_1",
    email: "person@example.com",
    passwordHash: "secret",
    firstName: "Pat",
    lastName: "Manager",
    role: "MANAGER",
    isActive: true,
    birthDate: "1990-01-01",
    ageVerifiedAt: "2025-01-01T00:00:00.000Z",
    sessionVersion: 2,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides
  };
}

const validInput = {
  firstName: "Chris",
  lastName: "Owner",
  email: "NEW@Example.com",
  phone: "3035551212",
  title: "Portfolio Manager",
  birthDate: "1990-01-01"
};

describe("own profile updates", () => {
  it("updates only the current user and normalizes a unique email", () => {
    const current = user();
    const other = user({ id: "user_2", email: "other@example.com", role: "TENANT", organizationId: "org_2" });
    const result = applyOwnProfileUpdate([current, other], current.id, validInput, now);

    expect(result.updatedUser.email).toBe("new@example.com");
    expect(result.updatedUser.firstName).toBe("Chris");
    expect(result.updatedUser.sessionVersion).toBe(3);
    expect(result.users.find((item) => item.id === other.id)).toEqual(other);
  });

  it("rejects duplicate emails case-insensitively", () => {
    const users = [user(), user({ id: "user_2", email: "new@example.com" })];
    expect(() => applyOwnProfileUpdate(users, "user_1", validInput, now)).toThrowError(
      new ProfileUpdateError("duplicate-email")
    );
  });

  it("rejects under-18 and future birth dates", () => {
    expect(() =>
      applyOwnProfileUpdate([user()], "user_1", { ...validInput, birthDate: "2010-01-01" }, now)
    ).toThrowError(new ProfileUpdateError("underage"));
    expect(() =>
      applyOwnProfileUpdate([user()], "user_1", { ...validInput, birthDate: "2030-01-01" }, now)
    ).toThrowError(new ProfileUpdateError("invalid-birthdate"));
  });

  it("does not allow self-editing to change role, organization, or security metadata", () => {
    const current = user({
      role: "TENANT",
      organizationId: "org_secure",
      passwordHash: "keep-me",
      termsAcceptedAt: "2026-01-01T00:00:00.000Z",
      stripeAccountId: "acct_keep"
    });
    const result = applyOwnProfileUpdate([current], current.id, validInput, now).updatedUser;

    expect(result.role).toBe("TENANT");
    expect(result.organizationId).toBe("org_secure");
    expect(result.passwordHash).toBe("keep-me");
    expect(result.termsAcceptedAt).toBe(current.termsAcceptedAt);
    expect(result.stripeAccountId).toBe("acct_keep");
  });
});
