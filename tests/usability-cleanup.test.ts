import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");

async function read(relativePath: string) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

describe("focused usability cleanup", () => {
  it("makes property rows easy to open and removes the delinquent column", async () => {
    const page = await read("app/(app)/properties/page.tsx");
    expect(page).toContain("ClickableTableRow");
    expect(page).toMatch(/>\s*Open\s*</);
    expect(page).not.toContain('"Delinquent"');
  });

  it("supports named property and unit photos with server-side caps and management", async () => {
    const actions = await read("lib/actions.ts");
    const propertyPage = await read("app/(app)/properties/[propertyId]/page.tsx");
    const unitPage = await read("app/(app)/units/[unitId]/page.tsx");

    expect(actions).toContain("existingCount + pendingUploads.length > PROPERTY_PHOTO_LIMIT");
    expect(actions).toContain("existingCount + uploads.length > UNIT_PHOTO_LIMIT");
    expect(actions).toContain("renamePropertyPhotoAction");
    expect(actions).toContain("deleteUnitPhotoAction");
    expect(propertyPage).toContain("Photo name");
    expect(unitPage).toContain("galleryFiles = unitFiles.length ? unitFiles : propertyFiles");
    expect(unitPage).toContain("Using property photos");
  });

  it("indexes tenant IDs and hides storage paths from the document register", async () => {
    const moveIn = await read("components/new-move-in-wizard.tsx");
    const actions = await read("lib/actions.ts");
    const documents = await read("app/(app)/documents/page.tsx");
    const lease = await read("app/(app)/leases/[leaseId]/page.tsx");
    const uploadRoute = await read("app/api/upload/route.ts");
    const documentRoute = await read("app/api/documents/[fileId]/route.ts");

    expect(moveIn).toContain("Upload tenant ID");
    expect(actions).toContain("kind: FileKind.TENANT_ID");
    expect(actions).toContain('visibility: "MANAGER_ONLY"');
    expect(documents).toContain("documentTypeLabel");
    expect(documents).toContain("documentDownloadHref(row.file.id)");
    expect(documents).not.toContain('columns={["File", "Attachment", "Kind", "Created", "Path"');
    expect(lease).toContain("Agreements and tenant ID");
    expect(uploadRoute).toContain('access: isTenantId ? "private" : "public"');
    expect(documentRoute).toContain('getBlob(privateReference.storageKey, { access: "private"');
    expect(documentRoute).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });

  it("keeps the send button content aligned", async () => {
    const submitButton = await read("components/ui/submit-button.tsx");
    const messages = await read("app/(app)/messages/page.tsx");
    expect(submitButton).toContain("inline-flex items-center justify-center gap-2");
    expect(messages).toContain("<Send");
    expect(messages).toContain("Sending...");
  });
});
