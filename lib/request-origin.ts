import "server-only";

const LOCAL_DEVELOPMENT_URL = "http://localhost:3000";

export type AppUrlDiagnostics = {
  present: boolean;
  valid: boolean;
  host: string | null;
  baseUrl: string | null;
  issue: string | null;
};

function inspectAppUrl(value = process.env.APP_URL): AppUrlDiagnostics {
  const trimmed = value?.trim();
  if (!trimmed) {
    return {
      present: false,
      valid: false,
      host: null,
      baseUrl: null,
      issue: "APP_URL is missing. Set it to the public Nexus app origin."
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      present: true,
      valid: false,
      host: null,
      baseUrl: null,
      issue: "APP_URL must be a valid absolute URL, including https:// in production."
    };
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    return {
      present: true,
      valid: false,
      host: url.host || null,
      baseUrl: null,
      issue: "APP_URL must be a public HTTP(S) origin without embedded credentials."
    };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) {
    return {
      present: true,
      valid: false,
      host: url.host,
      baseUrl: null,
      issue: "APP_URL must use the public Nexus domain, not a vercel.app deployment URL."
    };
  }

  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local");

  if (process.env.NODE_ENV === "production" && isLocalHost) {
    return {
      present: true,
      valid: false,
      host: url.host,
      baseUrl: null,
      issue: "APP_URL cannot use localhost or a local hostname in production."
    };
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return {
      present: true,
      valid: false,
      host: url.host,
      baseUrl: null,
      issue: "APP_URL must use https:// in production."
    };
  }

  return {
    present: true,
    valid: true,
    host: url.host,
    baseUrl: url.origin,
    issue: null
  };
}

export function getAppUrlDiagnostics() {
  return inspectAppUrl();
}

export function getAppBaseUrl() {
  const diagnostics = inspectAppUrl();

  if (diagnostics.valid && diagnostics.baseUrl) {
    return diagnostics.baseUrl;
  }

  if (!diagnostics.present && process.env.NODE_ENV !== "production") {
    return LOCAL_DEVELOPMENT_URL;
  }

  throw new Error(`Invalid APP_URL configuration: ${diagnostics.issue}`);
}

export function buildAppUrl(pathname: string, searchParams?: Record<string, string>) {
  const url = new URL(pathname, `${getAppBaseUrl()}/`);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export function assertCanonicalAppUrl(value: string, label: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${label}: expected an absolute URL.`);
  }

  const appBaseUrl = getAppBaseUrl();
  if (url.origin !== appBaseUrl) {
    throw new Error(`Invalid ${label}: expected the configured APP_URL host ${new URL(appBaseUrl).host}.`);
  }

  return url.toString();
}
