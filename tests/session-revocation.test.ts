import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  jwtVerify: vi.fn(),
  getUserById: vi.fn(),
  getOrganizationById: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: vi.fn(), delete: vi.fn() })
}));

vi.mock("jose", () => ({
  jwtVerify: mocks.jwtVerify,
  SignJWT: class {}
}));

vi.mock("../lib/store", () => ({
  getUserById: mocks.getUserById,
  getOrganizationById: mocks.getOrganizationById
}));

vi.mock("../lib/admin", () => ({
  getEffectiveUserRole: (role: string) => role,
  isSystemAdminEmail: () => false
}));

vi.mock("../lib/rbac", () => ({ canAccessPath: () => true }));

import { getCurrentUser } from "../lib/auth";

const baseUser = {
  id: "user_1",
  organizationId: "org_1",
  email: "manager@example.com",
  role: "MANAGER",
  isActive: true,
  firstName: "M",
  lastName: "G"
};

function setToken(sessionVersion: number | undefined) {
  mocks.cookieGet.mockReturnValue({ value: "token" });
  mocks.jwtVerify.mockResolvedValue({
    payload: { sub: "user_1", organizationId: "org_1", role: "MANAGER", email: baseUser.email, sessionVersion }
  });
}

describe("session revocation via sessionVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationById.mockResolvedValue({ id: "org_1", name: "Org" });
  });

  it("rejects a token whose sessionVersion is older than the user's", async () => {
    setToken(0);
    mocks.getUserById.mockResolvedValue({ ...baseUser, sessionVersion: 1 });
    expect(await getCurrentUser()).toBeNull();
  });

  it("accepts a token whose sessionVersion matches the user's", async () => {
    setToken(2);
    mocks.getUserById.mockResolvedValue({ ...baseUser, sessionVersion: 2 });
    const user = await getCurrentUser();
    expect(user?.id).toBe("user_1");
  });

  it("treats missing sessionVersion as 0 on both sides (legacy tokens stay valid)", async () => {
    setToken(undefined);
    mocks.getUserById.mockResolvedValue({ ...baseUser });
    const user = await getCurrentUser();
    expect(user?.id).toBe("user_1");
  });

  it("rejects a legacy token (no version) once the user's version is bumped", async () => {
    setToken(undefined);
    mocks.getUserById.mockResolvedValue({ ...baseUser, sessionVersion: 1 });
    expect(await getCurrentUser()).toBeNull();
  });
});
