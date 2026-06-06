import "server-only";

import { assertCanonicalAppUrl, getAppUrlDiagnostics } from "./request-origin";

type PasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
};

type TenantInviteEmailInput = {
  to: string;
  managerName: string;
  managerEmail: string;
  propertyLabel: string;
  inviteUrl: string;
  expiresAt: string;
};

type OutboundEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type EmailResult = {
  sent: boolean;
  error?: string;
};

type ParsedEmailAddress = {
  email: string;
  name?: string;
};

type EmailTransport = "worker" | "rest" | "none";

type EmailConfig = {
  from: ParsedEmailAddress;
  fromSource: string;
  usesDefaultFrom: boolean;
  workerUrl?: string;
  workerSecret?: string;
  accountId?: string;
  apiToken?: string;
  transport: EmailTransport;
};

export type EmailDiagnostics = {
  configured: boolean;
  transport: EmailTransport;
  appUrl: {
    present: boolean;
    valid: boolean;
    host: string | null;
  };
  sender: {
    present: boolean;
    source: string;
    emailDomain: string | null;
    usesDefault: boolean;
  };
  worker: {
    urlPresent: boolean;
    urlHost: string | null;
    secretPresent: boolean;
  };
  rest: {
    accountIdPresent: boolean;
    apiTokenPresent: boolean;
  };
  legacy: {
    resendApiKeyPresent: boolean;
    resetEmailFromPresent: boolean;
  };
  issues: string[];
  recommendations: string[];
};

export type EmailWorkerProbeResult = {
  ok: boolean;
  stage: "config" | "network" | "worker";
  status?: number;
  error?: string;
  response?: unknown;
};

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getEmailFromAddress() {
  const candidates = [
    ["CLOUDFLARE_EMAIL_FROM", getEnv("CLOUDFLARE_EMAIL_FROM")],
    ["RESET_EMAIL_FROM", getEnv("RESET_EMAIL_FROM")],
    ["EMAIL_FROM", getEnv("EMAIL_FROM")]
  ] as const;

  for (const [source, value] of candidates) {
    if (value) {
      return { value, source, usesDefault: false };
    }
  }

  return {
    value: "Nexus Rentals <no-reply@nexusrentals.local>",
    source: "default",
    usesDefault: true
  };
}

function parseEmailAddress(value: string): ParsedEmailAddress {
  const trimmed = value.trim();
  const displayMatch = trimmed.match(/^(.*?)<([^<>]+)>$/);

  if (!displayMatch) return { email: trimmed };

  const name = displayMatch[1].trim().replace(/^"|"$/g, "");
  return {
    email: displayMatch[2].trim(),
    ...(name ? { name } : {})
  };
}

function getEmailDomain(email: string) {
  const atIndex = email.lastIndexOf("@");
  return atIndex >= 0 ? email.slice(atIndex + 1).toLowerCase() : null;
}

function getUrlHost(value?: string) {
  if (!value) return null;

  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function getEmailConfig(): EmailConfig {
  const fromAddress = getEmailFromAddress();
  const from = parseEmailAddress(fromAddress.value);
  const workerUrl = getEnv("CLOUDFLARE_EMAIL_WORKER_URL") || getEnv("EMAIL_WORKER_URL");
  const workerSecret = getEnv("CLOUDFLARE_EMAIL_WORKER_SECRET") || getEnv("NEXUS_EMAIL_SECRET") || getEnv("CLOUDFLARE_WORKER_SECRET");
  const accountId = getEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = getEnv("CLOUDFLARE_EMAIL_API_TOKEN");
  const transport = workerUrl && workerSecret ? "worker" : accountId && apiToken ? "rest" : "none";

  return {
    from,
    fromSource: fromAddress.source,
    usesDefaultFrom: fromAddress.usesDefault,
    workerUrl,
    workerSecret,
    accountId,
    apiToken,
    transport
  };
}

export function getEmailDiagnostics(): EmailDiagnostics {
  const config = getEmailConfig();
  const appUrl = getAppUrlDiagnostics();
  const workerUrlHost = getUrlHost(config.workerUrl);
  const senderDomain = getEmailDomain(config.from.email);
  const issues: string[] = [];
  const recommendations: string[] = [];
  const hasLegacyResendKey = Boolean(getEnv("RESEND_API_KEY"));
  const hasLegacyResetFrom = Boolean(getEnv("RESET_EMAIL_FROM"));

  if (!appUrl.valid && appUrl.issue) {
    issues.push(appUrl.issue);
  }

  if (config.usesDefaultFrom) {
    issues.push("CLOUDFLARE_EMAIL_FROM is missing. The default local sender will be rejected by Cloudflare.");
  }

  if (!senderDomain) {
    issues.push("The configured email sender is not a valid email address.");
  }

  if (config.workerUrl && !workerUrlHost) {
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
    issues.push("No Cloudflare email transport is configured. Set the Worker URL and secret, or the REST API account ID and token.");
  }

  if (hasLegacyResendKey) {
    recommendations.push("RESEND_API_KEY is still present but is no longer used for email delivery. If this is your Worker secret, move it to CLOUDFLARE_EMAIL_WORKER_SECRET.");
  }

  if (hasLegacyResetFrom && config.fromSource === "RESET_EMAIL_FROM") {
    recommendations.push("RESET_EMAIL_FROM is being used as a compatibility fallback. Rename it to CLOUDFLARE_EMAIL_FROM.");
  }

  if (config.workerUrl && workerUrlHost && senderDomain && workerUrlHost !== senderDomain) {
    recommendations.push("Confirm the Cloudflare Worker custom domain and sender address are both configured in Cloudflare Email Service.");
  }

  return {
    configured: issues.length === 0,
    transport: config.transport,
    appUrl: {
      present: appUrl.present,
      valid: appUrl.valid,
      host: appUrl.host
    },
    sender: {
      present: !config.usesDefaultFrom,
      source: config.fromSource,
      emailDomain: senderDomain,
      usesDefault: config.usesDefaultFrom
    },
    worker: {
      urlPresent: Boolean(config.workerUrl),
      urlHost: workerUrlHost,
      secretPresent: Boolean(config.workerSecret)
    },
    rest: {
      accountIdPresent: Boolean(config.accountId),
      apiTokenPresent: Boolean(config.apiToken)
    },
    legacy: {
      resendApiKeyPresent: hasLegacyResendKey,
      resetEmailFromPresent: hasLegacyResetFrom
    },
    issues,
    recommendations
  };
}

export async function probeEmailWorker(): Promise<EmailWorkerProbeResult> {
  const config = getEmailConfig();

  if (!config.workerUrl) {
    return {
      ok: false,
      stage: "config",
      error: "CLOUDFLARE_EMAIL_WORKER_URL is missing."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(config.workerUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    const parsed = text ? await Promise.resolve().then(() => JSON.parse(text)).catch(() => text.slice(0, 500)) : null;

    return {
      ok: response.ok,
      stage: "worker",
      status: response.status,
      response: parsed
    };
  } catch (error) {
    return {
      ok: false,
      stage: "network",
      error: error instanceof Error ? error.message : "Could not reach the Cloudflare email Worker."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail({ to, subject, html, text }: OutboundEmailInput): Promise<EmailResult> {
  const config = getEmailConfig();
  const diagnostics = getEmailDiagnostics();
  const { from, workerUrl, workerSecret, accountId, apiToken } = config;

  if (config.transport === "worker" && workerUrl && workerSecret) {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to, subject, html, text })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Cloudflare email worker failed: ${response.status} ${detail}`);
    }

    return { sent: true };
  }

  if (config.transport === "rest" && accountId && apiToken) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: from.name ? { address: from.email, name: from.name } : from.email,
        to,
        subject,
        html,
        text
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Cloudflare email API failed: ${response.status} ${detail}`);
    }

    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; errors?: Array<{ message?: string }> };
    if (payload.success === false) {
      throw new Error(`Cloudflare email API failed: ${payload.errors?.map((item) => item.message).filter(Boolean).join("; ") || "Unknown error"}`);
    }

    return { sent: true };
  }

  return {
    sent: false,
    error: `Cloudflare email is not configured. ${diagnostics.issues.join(" ")}`
  };
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: PasswordResetEmailInput) {
  const canonicalResetUrl = assertCanonicalAppUrl(resetUrl, "password reset URL");
  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(canonicalResetUrl);

  return sendEmail({
    to,
    subject: "Reset your Nexus Rentals password",
    html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h1 style="font-size: 22px;">Reset your password</h1>
          <p>Hi ${safeName},</p>
          <p>We received a request to reset your Nexus Rentals password. This link expires in 1 hour.</p>
          <p>
            <a href="${safeResetUrl}" style="display: inline-block; border-radius: 12px; background: #1f6b5f; color: #ffffff; padding: 12px 18px; text-decoration: none; font-weight: 700;">
              Reset password
            </a>
          </p>
          <p>If you did not request this, you can ignore this email.</p>
          <p style="font-size: 12px; color: #5f6b7d;">${safeResetUrl}</p>
        </div>
      `,
    text: `Hi ${name},\n\nReset your Nexus Rentals password using this link. It expires in 1 hour:\n\n${canonicalResetUrl}\n\nIf you did not request this, you can ignore this email.`
  });
}

export async function sendTenantInviteEmail({ to, managerName, managerEmail, propertyLabel, inviteUrl, expiresAt }: TenantInviteEmailInput) {
  const canonicalInviteUrl = assertCanonicalAppUrl(inviteUrl, "tenant invite URL");
  const safeManagerName = escapeHtml(managerName);
  const safeManagerEmail = escapeHtml(managerEmail);
  const safePropertyLabel = escapeHtml(propertyLabel);
  const safeInviteUrl = escapeHtml(canonicalInviteUrl);
  const safeExpiresAt = escapeHtml(expiresAt);

  return sendEmail({
    to,
    subject: `Complete your Nexus Rentals setup for ${propertyLabel}`,
    html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h1 style="font-size: 22px;">Review and connect to your lease</h1>
          <p>${safeManagerName} (${safeManagerEmail}) invited you to review and connect to your lease for ${safePropertyLabel}.</p>
          <p>Open the secure link below, then create an account or sign in using the same email address that received this message.</p>
          <p>This invite expires on ${safeExpiresAt}.</p>
          <p>
            <a href="${safeInviteUrl}" style="display: inline-block; border-radius: 12px; background: #1f6b5f; color: #ffffff; padding: 12px 18px; text-decoration: none; font-weight: 700;">
              Review lease and get started
            </a>
          </p>
          <p style="font-size: 12px; color: #5f6b7d;">${safeInviteUrl}</p>
        </div>
      `,
    text: `${managerName} (${managerEmail}) invited you to review and connect to your lease for ${propertyLabel}.\n\nCreate an account or sign in with this email address, then accept the invite before ${expiresAt}:\n\n${canonicalInviteUrl}`
  });
}
