import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  canAccessPath: vi.fn(),
  isSystemAdminEmail: vi.fn()
}));

vi.mock("jose", () => ({
  jwtVerify: mocks.jwtVerify
}));

vi.mock("../lib/admin", () => ({
  getEffectiveUserRole: vi.fn((role: string) => role),
  isSystemAdminEmail: mocks.isSystemAdminEmail
}));

vi.mock("../lib/rbac", () => ({
  canAccessPath: mocks.canAccessPath
}));

import { middleware } from "../middleware";

function request(pathname: string) {
  return new NextRequest(`https://app.nexusrentals.co${pathname}`, {
    headers: {
      cookie: "rentroll_session=session-token"
    }
  });
}

describe("middleware API handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        email: "manager@nexusrentals.co",
        role: "MANAGER"
      }
    });
    mocks.isSystemAdminEmail.mockReturnValue(false);
    mocks.canAccessPath.mockReturnValue(false);
  });

  it("lets authenticated API requests reach route-level authorization", async () => {
    const response = await middleware(request("/api/tenant-invites/send"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.canAccessPath).not.toHaveBeenCalled();
  });

  it("returns JSON instead of HTML redirects for unauthenticated API requests", async () => {
    const response = await middleware(
      new NextRequest("https://app.nexusrentals.co/api/tenant-invites/send")
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Authentication required." });
  });

  it("keeps page RBAC redirects for disallowed manager pages", async () => {
    const response = await middleware(request("/admin-tools"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.nexusrentals.co/dashboard");
  });

  it("blocks managers from admin pages", async () => {
    const response = await middleware(request("/admin/system-health"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.nexusrentals.co/dashboard");
  });

  it("returns forbidden JSON for manager requests to admin APIs", async () => {
    const response = await middleware(request("/api/admin/export/users"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("never blocks the Stripe webhook, which carries no session cookie", async () => {
    const response = await middleware(new NextRequest("https://app.nexusrentals.co/api/stripe/webhook"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets authenticated requests reach the Stripe Connect return route", async () => {
    const response = await middleware(request("/api/stripe/connect/return"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows the reserved system admin through admin routes", async () => {
    mocks.isSystemAdminEmail.mockReturnValue(true);

    const response = await middleware(request("/admin/operations"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
