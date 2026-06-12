import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isAllowedStoredAssetPath,
  isAllowedTenantIdAssetPath,
  parsePrivateAssetReference
} from "@/lib/file-security";

const owner = {
  id: "manager-1",
  organizationId: "org-1"
};

describe("private file references", () => {
  it("accepts owner-scoped tenant ID references with approved extensions", () => {
    const local = "private-local:uploads/org-1/manager-1/123-tenant-id.pdf";
    const blob = "private-blob:uploads/org-1/manager-1/123-tenant-id-a1b2c3d4.png";

    expect(isAllowedTenantIdAssetPath(local, owner)).toBe(true);
    expect(isAllowedTenantIdAssetPath(blob, owner)).toBe(true);
    expect(isAllowedStoredAssetPath(local)).toBe(true);
    expect(parsePrivateAssetReference(blob)).toEqual({
      storage: "blob",
      storageKey: "uploads/org-1/manager-1/123-tenant-id-a1b2c3d4.png"
    });
  });

  it("rejects another user's path, unsafe traversal, and unsupported ID formats", () => {
    expect(isAllowedTenantIdAssetPath("private-local:uploads/org-1/manager-2/tenant-id.pdf", owner)).toBe(false);
    expect(isAllowedTenantIdAssetPath("private-local:uploads/org-1/manager-1/../tenant-id.pdf", owner)).toBe(false);
    expect(isAllowedTenantIdAssetPath("private-blob:uploads/org-1/manager-1/tenant-id.docx", owner)).toBe(false);
    expect(parsePrivateAssetReference("private-local:/uploads/org-1/manager-1/tenant-id.pdf")).toBeNull();
  });
});
