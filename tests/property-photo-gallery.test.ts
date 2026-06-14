import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getPhotoSwipeDirection } from "@/lib/photo-gallery";

const ROOT = path.join(__dirname, "..");

describe("property photo gallery", () => {
  it("recognizes deliberate horizontal swipes without hijacking vertical scrolling", () => {
    expect(getPhotoSwipeDirection({ x: 220, y: 100 }, { x: 120, y: 108 })).toBe(1);
    expect(getPhotoSwipeDirection({ x: 120, y: 100 }, { x: 220, y: 108 })).toBe(-1);
    expect(getPhotoSwipeDirection({ x: 120, y: 100 }, { x: 100, y: 190 })).toBe(0);
    expect(getPhotoSwipeDirection({ x: 120, y: 100 }, { x: 90, y: 105 })).toBe(0);
  });

  it("keeps all safe property images and exposes direct photo selection", async () => {
    const page = await fs.readFile(path.join(ROOT, "app/(app)/properties/[propertyId]/page.tsx"), "utf8");
    const carousel = await fs.readFile(path.join(ROOT, "components/photo-carousel.tsx"), "utf8");

    expect(page).toContain('.filter((file: any) => file.kind === "PROPERTY_IMAGE"');
    expect(page).toContain(".slice(0, 20)");
    expect(carousel).toContain("photos.map((candidate, candidateIndex)");
    expect(carousel).toContain("onPointerDown");
    expect(carousel).toContain("onPointerUp");
    expect(carousel).toContain("Show photo ${candidateIndex + 1} of ${photos.length}");
  });
});
