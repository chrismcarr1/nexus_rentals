import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env", override: false });

function getEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseEmailAddress(value) {
  const trimmed = value.trim();
  const displayMatch = trimmed.match(/^(.*?)<([^<>]+)>$/);
  const email = displayMatch ? displayMatch[2].trim() : trimmed;
  const name = displayMatch ? displayMatch[1].trim().replace(/^"|"$/g, "") : undefined;
  return { email, name };
}

function getUrlHost(value) {
  if (!value) return null;

  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function inspectAppUrl(value) {
  if (!value) {
    return {
      present: false,
      valid: false,
      host: null,
      issue: "APP_URL is missing. Set it to the public Nexus app origin."
    };
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return {
      present: true,
      valid: false,
      host: null,
      issue: "APP_URL must be a valid absolute URL, including https:// in production."
    };
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local");

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    return {
      present: true,
      valid: false,
      host: url.host || null,
      issue: "APP_URL must be a public HTTP(S) origin without embedded credentials."
    };
  }

  if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) {
    return {
      present: true,
      valid: false,
      host: url.host,
      issue: "APP_URL must use the public Nexus domain, not a vercel.app deployment URL."
    };
  }

  if (process.env.NODE_ENV === "production" && isLocalHost) {
    return {
      present: true,
      valid: false,
      host: url.host,
      issue: "APP_URL cannot use localhost or a local hostname in production."
    };
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return {
      present: true,
      valid: false,
      host: url.host,
      issue: "APP_URL must use https:// in production."
    };
  }

  return {
    present: true,
    valid: true,
    host: url.host,
    issue: null
  };
}

function mask(value) {
  if (!value) return "missing";
  if (value.length <= 8) return "present";
  return `present (${value.length} chars)`;
}

function getConfig() {
  const appUrl = inspectAppUrl(getEnv("APP_URL"));
  const fromSource = getEnv("CLOUDFLARE_EMAIL_FROM")
    ? "CLOUDFLARE_EMAIL_FROM"
    : getEnv("RESET_EMAIL_FROM")
      ? "RESET_EMAIL_FROM"
      : getEnv("EMAIL_FROM")
        ? "EMAIL_FROM"
        : "default";
  const fromValue = getEnv("CLOUDFLARE_EMAIL_FROM") || getEnv("RESET_EMAIL_FROM") || getEnv("EMAIL_FROM") || "Nexus Rentals <no-reply@nexusrentals.local>";
  const workerUrl = getEnv("CLOUDFLARE_EMAIL_WORKER_URL") || getEnv("EMAIL_WORKER_URL");
  const workerSecret = getEnv("CLOUDFLARE_EMAIL_WORKER_SECRET") || getEnv("NEXUS_EMAIL_SECRET") || getEnv("CLOUDFLARE_WORKER_SECRET");
  const accountId = getEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = getEnv("CLOUDFLARE_EMAIL_API_TOKEN");
  const transport = workerUrl && workerSecret ? "worker" : accountId && apiToken ? "rest" : "none";

  return {
    appUrl,
    fromSource,
    from: parseEmailAddress(fromValue),
    workerUrl,
    workerHost: getUrlHost(workerUrl),
    workerSecret,
    accountId,
    apiToken,
    transport,
    legacyResend: getEnv("RESEND_API_KEY"),
    legacyResetFrom: getEnv("RESET_EMAIL_FROM")
  };
}

function collectIssues(config) {
  const issues = [];
  const recommendations = [];

  if (!config.appUrl.valid && config.appUrl.issue) {
    issues.push(config.appUrl.issue);
  }

  if (config.fromSource === "default") {
    issues.push("CLOUDFLARE_EMAIL_FROM is missing. Cloudflare will reject the default local sender.");
  }

  if (!config.from.email.includes("@")) {
    issues.push("The configured sender is not a valid email address.");
  }

  if (config.workerUrl && !config.workerHost) {
    issues.push("CLOUDFLARE_EMAIL_WORKER_URL is not a valid absolute URL.");
  }

  if (config.workerUrl && !config.workerSecret) {
    issues.push("CLOUDFLARE_EMAIL_WORKER_URL is set, but CLOUDFLARE_EMAIL_WORKER_SECRET is missing.");
  }

  if (!config.workerUrl && config.workerSecret) {
    issues.push("CLOUDFLARE_EMAIL_WORKER_SECRET is set, but CLOUDFLARE_EMAIL_WORKER_URL is missing.");
  }

  if (config.accountId && !config.apiToken) {
    issues.push("CLOUDFLARE_ACCOUNT_ID is set, but CLOUDFLARE_EMAIL_API_TOKEN is missing.");
  }

  if (!config.accountId && config.apiToken) {
    issues.push("CLOUDFLARE_EMAIL_API_TOKEN is set, but CLOUDFLARE_ACCOUNT_ID is missing.");
  }

  if (config.transport === "none") {
    issues.push("No Cloudflare email transport is configured.");
  }

  if (config.legacyResend) {
    recommendations.push("RESEND_API_KEY is still present but no longer used. If this is your Worker secret, rename it to CLOUDFLARE_EMAIL_WORKER_SECRET.");
  }

  if (config.legacyResetFrom && config.fromSource === "RESET_EMAIL_FROM") {
    recommendations.push("RESET_EMAIL_FROM is being used as a compatibility fallback. Rename it to CLOUDFLARE_EMAIL_FROM.");
  }

  return { issues, recommendations };
}

async function probeWorker(url) {
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    const body = text ? await Promise.resolve().then(() => JSON.parse(text)).catch(() => text.slice(0, 300)) : null;

    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Worker probe failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const config = getConfig();
  const { issues, recommendations } = collectIssues(config);
  const shouldProbe = process.argv.includes("--probe");

  console.log("Nexus email configuration");
  console.log(`- APP_URL: ${config.appUrl.present ? "present" : "missing"}`);
  console.log(`- APP_URL host: ${config.appUrl.host ?? "missing"}`);
  console.log(`- transport: ${config.transport}`);
  console.log(`- sender source: ${config.fromSource}`);
  console.log(`- sender domain: ${config.from.email.includes("@") ? config.from.email.split("@").pop() : "invalid"}`);
  console.log(`- worker URL: ${config.workerUrl ? "present" : "missing"}`);
  console.log(`- worker host: ${config.workerHost ?? "missing"}`);
  console.log(`- worker secret: ${mask(config.workerSecret)}`);
  console.log(`- REST account ID: ${config.accountId ? "present" : "missing"}`);
  console.log(`- REST API token: ${mask(config.apiToken)}`);

  const workerProbe = shouldProbe ? await probeWorker(config.workerUrl) : null;
  if (workerProbe) {
    console.log(`- worker health: ${workerProbe.ok ? `ok (${workerProbe.status})` : `failed (${workerProbe.status ?? "network"})`}`);
    if (!workerProbe.ok && workerProbe.error) {
      console.log(`  ${workerProbe.error}`);
    }
  }

  if (issues.length) {
    console.log("\nIssues");
    for (const issue of issues) console.log(`- ${issue}`);
  }

  if (recommendations.length) {
    console.log("\nRecommendations");
    for (const recommendation of recommendations) console.log(`- ${recommendation}`);
  }

  if (!issues.length && (!workerProbe || workerProbe.ok)) {
    console.log("\nEmail configuration looks ready. Send a password reset or tenant invite to test live delivery.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
