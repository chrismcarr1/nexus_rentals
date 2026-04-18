import { describe, expect, it } from "vitest";

import { generateDamageEstimate } from "../services/damage-estimator";

describe("generateDamageEstimate", () => {
  it("increases confidence and range with more image context", () => {
    const small = generateDamageEstimate({
      notes: "wall scuffs and minor flooring damage",
      imagePaths: ["/uploads/a.png"]
    });
    const large = generateDamageEstimate({
      notes: "wall scuffs and minor flooring damage",
      imagePaths: ["/uploads/a.png", "/uploads/b.png", "/uploads/c.png"],
      baselinePaths: ["/uploads/base.png"]
    });

    expect(large.confidenceScore).toBeGreaterThan(small.confidenceScore);
    expect(large.estimatedHigh).toBeGreaterThan(small.estimatedHigh);
  });

  it("flags wear and tear language when inspection notes suggest it", () => {
    const estimate = generateDamageEstimate({
      notes: "general wear and scuff marks near hallway wall",
      imagePaths: ["/uploads/a.png"]
    });

    expect(estimate.wearAndTear).toBe(true);
    expect(estimate.summary.length).toBeGreaterThan(20);
  });
});
