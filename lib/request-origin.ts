import "server-only";

import { headers } from "next/headers";

function normalizeOrigin(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

export async function getAppOrigin() {
  const configuredOrigin =
    normalizeOrigin(process.env.APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeOrigin(process.env.VERCEL_BRANCH_URL) ??
    normalizeOrigin(process.env.VERCEL_URL);

  if (configuredOrigin) return configuredOrigin;

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing APP_URL. Set it to the canonical production origin.");
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const requestOrigin = normalizeOrigin(host ? `${proto}://${host}` : null);

  if (requestOrigin) return requestOrigin;

  return "http://localhost:3000";
}
