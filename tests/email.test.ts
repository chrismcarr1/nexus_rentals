import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const EMAIL_ENV_KEYS = [
  "APP_URL",
  "CLOUDFLARE_EMAIL_FROM",
  "CLOUDFLARE_EMAIL_WORKER_URL",
  "CLOUDFLARE_EMAIL_WORKER_SECRET",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_EMAIL_API_TOKEN",
  "EMAIL_FROM",
  "EMAIL_WORKER_URL",
  "NEXUS_EMAIL_SECRET",
  "CLOUDFLARE_WORKER_SECRET",
  "RESEND_API_KEY",
  "RESET_EMAIL_FROM"
] as const;

function clearEmailEnv() {
  for (const key of EMAIL_ENV_KEYS) {
    delete process.env[key];
  }
}

describe("Cloudflare email sender", () => {
  beforeEach(() => {
    clearEmailEnv();
    process.env.APP_URL = "https://nexus.example.com";
    process.env.CLOUDFLARE_EMAIL_FROM = "Nexus Rentals <welcome@noreply.nexusrentals.co>";
    process.env.CLOUDFLARE_EMAIL_WORKER_URL = "https://email-worker.example.com";
    process.env.CLOUDFLARE_EMAIL_WORKER_SECRET = "worker-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearEmailEnv();
  });

  it("sends password reset emails through the Cloudflare Worker", async () => {
    const fetchMock = vi.fn(async () => Response.json({ sent: true, messageId: "msg_reset" }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendPasswordResetEmail } = await import("../lib/email");

    const result = await sendPasswordResetEmail({
      to: "tenant@example.com",
      name: "Taylor",
      resetUrl: "https://nexus.example.com/reset-password?token=abc"
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(url).toBe("https://email-worker.example.com");
    expect(url).not.toContain("resend");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer worker-secret",
      "Content-Type": "application/json"
    });
    expect(body).toMatchObject({
      from: { email: "welcome@noreply.nexusrentals.co", name: "Nexus Rentals" },
      to: "tenant@example.com",
      subject: "Reset your Nexus Rentals password"
    });
    expect(body.html).toContain("Reset password");
    expect(body.text).toContain("reset-password?token=abc");
  });

  it("sends tenant invite emails through the Cloudflare Worker", async () => {
    const fetchMock = vi.fn(async () => Response.json({ sent: true, messageId: "msg_invite" }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendTenantInviteEmail } = await import("../lib/email");

    const result = await sendTenantInviteEmail({
      to: "resident@example.com",
      managerName: "Chris Carr",
      managerEmail: "manager@nexusrentals.co",
      propertyLabel: "Nexus Lofts, Unit 4",
      inviteUrl: "https://nexus.example.com/invite/token",
      expiresAt: "Jun 30, 2026"
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(url).toBe("https://email-worker.example.com");
    expect(body).toMatchObject({
      to: "resident@example.com",
      subject: "Complete your Nexus Rentals setup for Nexus Lofts, Unit 4"
    });
    expect(body.html).toContain("Review lease and get started");
    expect(body.text).toContain("https://nexus.example.com/invite/token");
  });

  it("reports a clear configuration problem when no Cloudflare transport exists", async () => {
    clearEmailEnv();
    process.env.APP_URL = "https://nexus.example.com";

    const { getEmailDiagnostics, sendTenantInviteEmail } = await import("../lib/email");

    expect(getEmailDiagnostics()).toMatchObject({
      configured: false,
      transport: "none",
      appUrl: {
        present: true,
        valid: true,
        host: "nexus.example.com"
      }
    });

    const result = await sendTenantInviteEmail({
      to: "resident@example.com",
      managerName: "Chris Carr",
      managerEmail: "manager@nexusrentals.co",
      propertyLabel: "Nexus Lofts",
      inviteUrl: "https://nexus.example.com/invite/token",
      expiresAt: "Jun 30, 2026"
    });

    expect(result.sent).toBe(false);
    expect(result.error).toContain("No Cloudflare email transport is configured");
  });

  it("reports APP_URL as missing without exposing any secret values", async () => {
    delete process.env.APP_URL;

    const { getEmailDiagnostics } = await import("../lib/email");

    expect(getEmailDiagnostics()).toMatchObject({
      configured: false,
      appUrl: {
        present: false,
        valid: false,
        host: null
      },
      issues: expect.arrayContaining([expect.stringContaining("APP_URL is missing")])
    });
  });

  it("refuses to send a reset link from a different host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { sendPasswordResetEmail } = await import("../lib/email");

    await expect(
      sendPasswordResetEmail({
        to: "tenant@example.com",
        name: "Taylor",
        resetUrl: "https://protected-preview.vercel.app/reset-password?token=abc"
      })
    ).rejects.toThrow("expected the configured APP_URL host nexus.example.com");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
