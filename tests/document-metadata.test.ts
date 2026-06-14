import { describe, expect, it } from "vitest";

import {
  cleanDisplayName,
  defaultPhotoName,
  documentDownloadHref,
  documentFilterGroup,
  documentTypeLabel,
  getFileDisplayName,
  photoLimitExceeded,
  PROPERTY_PHOTO_LIMIT,
  UNIT_PHOTO_LIMIT
} from "@/lib/document-metadata";

describe("document and photo metadata", () => {
  it("enforces property and unit photo caps using existing plus incoming photos", () => {
    expect(photoLimitExceeded(19, 1, PROPERTY_PHOTO_LIMIT)).toBe(false);
    expect(photoLimitExceeded(19, 2, PROPERTY_PHOTO_LIMIT)).toBe(true);
    expect(photoLimitExceeded(10, 1, UNIT_PHOTO_LIMIT)).toBe(true);
  });

  it("creates clean photo names and safe legacy fallbacks", () => {
    expect(defaultPhotoName("property", 1)).toBe("Property photo 1");
    expect(defaultPhotoName("unit", 3)).toBe("Unit photo 3");
    expect(cleanDisplayName("  Front   exterior  ", "Property photo 1")).toBe("Front exterior");
    expect(getFileDisplayName({ kind: "GENERAL_DOCUMENT", path: "/uploads/org/user/1234567890123-file.pdf" })).toBe("file.pdf");
  });

  it("organizes document types into user-facing filters", () => {
    expect(documentTypeLabel("TENANT_ID")).toBe("Tenant ID");
    expect(documentTypeLabel("UNKNOWN")).toBe("General document");
    expect(documentFilterGroup("PROPERTY_IMAGE")).toBe("property-images");
    expect(documentFilterGroup("TENANT_ID")).toBe("ids");
    expect(documentFilterGroup("LEASE_ATTACHMENT")).toBe("leases");
  });

  it("uses opaque authenticated document links instead of storage paths", () => {
    expect(documentDownloadHref("file/id with spaces")).toBe("/api/documents/file%2Fid%20with%20spaces");
  });
});
