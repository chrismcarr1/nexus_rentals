import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createTenantInviteDraft: vi.fn(),
  saveSentTenantInvite: vi.fn(),
  sendTenantInviteEmail: vi.fn(),
  readStore: vi.fn(),
  buildAppUrl: vi.fn()
}));

vi.mock("../lib/address", () => ({
  formatUnitAddress: vi.fn(() => "100 Main St, Unit 4, Denver, CO 80202")
}));

vi.mock("../lib/email", () => ({
  sendTenantInviteEmail: mocks.sendTenantInviteEmail
}));

vi.mock("../lib/lease-connections", () => ({
  createTenantInviteDraft: mocks.createTenantInviteDraft,
  getLeaseProperty: vi.fn(() => ({ name: "Nexus Lofts" })),
  getLeaseUnit: vi.fn(() => ({ unitNumber: "4" })),
  saveSentTenantInvite: mocks.saveSentTenantInvite
}));

vi.mock("../lib/request-origin", () => ({
  buildAppUrl: mocks.buildAppUrl
}));

vi.mock("../lib/store", () => ({
  readStore: mocks.readStore
}));

vi.mock("../lib/utils", () => ({
  formatDate: vi.fn(() => "Jun 30, 2026")
}));

const manager = {
  id: "manager_1",
  organizationId: "org_1",
  email: "manager@nexusrentals.co",
  firstName: "Chris",
  lastName: "Carr",
  role: "MANAGER"
};

const invite = {
  id: "invite_new",
  leaseId: "lease_1",
  managerUserId: manager.id,
  tenantEmail: "resident@example.com",
  tokenHash: "hash",
  status: "pending",
  expiresAt: "2026-06-30T12:00:00.000Z",
  createdAt: "2026-06-05T12:00:00.000Z",
  updatedAt: "2026-06-05T12:00:00.000Z"
};

describe("sendLeaseTenantInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTenantInviteDraft.mockResolvedValue({
      rawToken: "fresh-token",
      invite,
      lease: { id: "lease_1" }
    });
    mocks.readStore.mockResolvedValue({});
    mocks.buildAppUrl.mockReturnValue("https://app.nexusrentals.co/invite/fresh-token");
    mocks.saveSentTenantInvite.mockResolvedValue({ ...invite, sentAt: "2026-06-05T12:01:00.000Z" });
  });

  it("emails the lease address and activates the fresh invite after Cloudflare accepts it", async () => {
    mocks.sendTenantInviteEmail.mockResolvedValue({ sent: true });

    const { sendLeaseTenantInvite } = await import("../lib/tenant-invite-delivery");
    const result = await sendLeaseTenantInvite("lease_1", manager as never);

    expect(mocks.sendTenantInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "resident@example.com",
        inviteUrl: "https://app.nexusrentals.co/invite/fresh-token",
        propertyLabel: expect.stringContaining("Nexus Lofts")
      })
    );
    expect(mocks.saveSentTenantInvite).toHaveBeenCalledWith(invite, manager);
    expect(result.tenantEmail).toBe("resident@example.com");
  });

  it("does not persist the fresh token when Cloudflare rejects delivery", async () => {
    mocks.sendTenantInviteEmail.mockResolvedValue({
      sent: false,
      error: "Cloudflare rejected the sender."
    });

    const { sendLeaseTenantInvite } = await import("../lib/tenant-invite-delivery");

    await expect(sendLeaseTenantInvite("lease_1", manager as never)).rejects.toThrow("Cloudflare rejected the sender.");
    expect(mocks.saveSentTenantInvite).not.toHaveBeenCalled();
  });
});
