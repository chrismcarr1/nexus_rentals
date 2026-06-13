import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");

async function read(relativePath: string) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

describe("Nexus Rentals brand integration", () => {
  it("ships transparent full-logo and icon artwork for UI and metadata", async () => {
    const assets = [
      "public/brand/nexus-rentals-logo-transparent.png",
      "public/brand/nexus-house-icon-transparent.png",
      "public/icon.png",
      "app/icon.png"
    ];

    for (const asset of assets) {
      const assetPath = path.join(ROOT, asset);
      const stat = await fs.stat(assetPath);
      const png = await fs.readFile(assetPath);

      expect(stat.size).toBeGreaterThan(1_000);
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png[25]).toBe(6);
    }

    for (const removedAsset of [
      "public/brand/nexus-rentals-logo.png",
      "public/brand/nexus-house-icon.png",
      "public/brand/nexus-house-icon-square.png"
    ]) {
      await expect(fs.stat(path.join(ROOT, removedAsset))).rejects.toMatchObject({ code: "ENOENT" });
    }

    const layout = await read("app/layout.tsx");
    expect(layout).toContain('url: "/icon.png"');
    expect(layout).toContain('url: "/brand/nexus-house-icon-transparent.png"');
  });

  it("provides the requested reusable logo variants and sizes", async () => {
    const component = await read("components/brand/nexus-logo.tsx");

    expect(component).toContain('"full" | "icon"');
    expect(component).toContain('"xs" | "sm" | "md" | "lg" | "xl"');
    expect(component).toContain('alt={icon ? "Nexus Rentals icon" : "Nexus Rentals"}');
    expect(component).toContain('"/brand/nexus-house-icon-transparent.png"');
    expect(component).toContain('"/brand/nexus-rentals-logo-transparent.png"');
    expect(component).not.toContain("wordmark");
  });

  it("uses the shared component across public, auth, app, mobile, and admin surfaces", async () => {
    const files = [
      "app/page.tsx",
      "components/public-site-header.tsx",
      "components/auth-shell.tsx",
      "components/app-shell.tsx",
      "components/top-bar.tsx",
      "components/mobile-menu-panel.tsx",
      "components/admin/admin-shell.tsx"
    ];

    for (const file of files) {
      const source = await read(file);
      expect(source).toContain("NexusLogo");
      expect(source).not.toMatch(/>N[RX]?</);
      expect(source).not.toContain('variant="wordmark"');
    }

    const appShell = await read("components/app-shell.tsx");
    expect(appShell).toContain('collapsed ? (');
    expect(appShell).toContain('<NexusLogo variant="icon" size="sm" />');
    expect(appShell).toContain('<NexusLogo variant="full" size="sm" />');
  });
});
