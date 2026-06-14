import { normalizeEmail } from "@/lib/admin";
import { validateBirthDateInput } from "@/lib/legal";
import { formatPhoneNumber } from "@/lib/phone";
import type { User } from "@/lib/store";

export type OwnProfileInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  birthDate: string;
};

export class ProfileUpdateError extends Error {
  constructor(public code: "invalid-profile" | "duplicate-email" | "invalid-birthdate" | "underage") {
    super(code);
  }
}

export function applyOwnProfileUpdate(users: User[], currentUserId: string, input: OwnProfileInput, at = new Date()) {
  const current = users.find((user) => user.id === currentUserId);
  if (!current) throw new ProfileUpdateError("invalid-profile");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = normalizeEmail(input.email);
  if (firstName.length < 2 || lastName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ProfileUpdateError("invalid-profile");
  }

  const birthDate = validateBirthDateInput(input.birthDate, at);
  if (birthDate.ok === false) {
    throw new ProfileUpdateError(birthDate.error === "underage" ? "underage" : "invalid-birthdate");
  }

  if (users.some((user) => user.id !== currentUserId && normalizeEmail(user.email) === email)) {
    throw new ProfileUpdateError("duplicate-email");
  }

  const emailChanged = normalizeEmail(current.email) !== email;
  const updatedAt = at.toISOString();
  const updatedUser: User = {
    ...current,
    firstName,
    lastName,
    email,
    phone: formatPhoneNumber(input.phone) || undefined,
    title: input.title?.trim().slice(0, 100) || undefined,
    birthDate: birthDate.birthDate,
    ageVerifiedAt: current.birthDate === birthDate.birthDate && current.ageVerifiedAt ? current.ageVerifiedAt : updatedAt,
    sessionVersion: (current.sessionVersion ?? 0) + (emailChanged ? 1 : 0),
    updatedAt
  };

  return {
    users: users.map((user) => (user.id === currentUserId ? updatedUser : user)),
    updatedUser,
    emailChanged
  };
}
