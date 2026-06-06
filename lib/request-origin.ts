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

function isUnsafeProductionOrigin(origin: string) {
  const { hostname } = new URL(origin);
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname === "your-vercel-domain.vercel.app"
  );
}

export async function getAppOrigin() {
  const configuredOrigin = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL
  ]
    .map(normalizeOrigin)
    .find((origin): origin is string => Boolean(origin && (process.env.NODE_ENV !== "production" || !isUnsafeProductionOrigin(origin))));

  if (configuredOrigin) return configuredOrigin;

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const requestOrigin = normalizeOrigin(host ? `${proto}://${host}` : null);

  if (requestOrigin) return requestOrigin;

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing a valid production APP_URL. Set it to the canonical deployed origin.");
  }

  return "http://localhost:3000";
}
