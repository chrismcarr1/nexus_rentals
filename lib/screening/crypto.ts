import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function encryptionKey() {
  const secret = process.env.SCREENING_ENCRYPTION_KEY?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("Missing SCREENING_ENCRYPTION_KEY. It is required to encrypt screening provider tokens.");
  }
  return createHash("sha256").update(secret || "development-screening-key").digest();
}

export function createScreeningAccessToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashScreeningAccessToken(token) };
}

export function hashScreeningAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function accessTokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashScreeningAccessToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function encryptProviderToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptProviderToken(value?: string | null) {
  if (!value) return null;
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted screening token.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
