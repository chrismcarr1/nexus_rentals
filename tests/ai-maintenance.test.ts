import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  normalizeCategory,
  normalizeContractorType,
  normalizeMaintenanceAnalysis,
  normalizePriority,
  normalizeTimeline
} from "@/lib/ai-maintenance";

function validRawAnalysis() {
  return {
    title: "Kitchen sink drain leak",
    category: "plumbing",
    priority: "urgent",
    issueSummary: "Water is leaking from the drain pipe under the kitchen sink. The cabinet floor is wet and the leak worsens when the sink is used.",
    likelyCause: "A failed slip-joint washer or loose drain connection.",
    recommendedRepair: "Have a plumber reseat or replace the drain trap connections.",
    estimatedCostLow: 100,
    estimatedCostHigh: 300,
    estimatedTimeline: "24-48 hours",
    contractorType: "plumber",
    confidenceScore: 0.85,
    safetyNotes: ""
  };
}

describe("normalizeCategory", () => {
  it("passes through allowed values and maps synonyms", () => {
    expect(normalizeCategory("plumbing")).toBe("plumbing");
    expect(normalizeCategory("HVAC")).toBe("hvac");
    expect(normalizeCategory("Heating / cooling")).toBe("hvac");
    expect(normalizeCategory("roofing")).toBe("exterior");
  });

  it("falls back to other for unknown values", () => {
    expect(normalizeCategory("mystery issue")).toBe("other");
  });
});

describe("normalizePriority", () => {
  it("passes through allowed values and maps synonyms", () => {
    expect(normalizePriority("emergency")).toBe("emergency");
    expect(normalizePriority("High")).toBe("urgent");
    expect(normalizePriority("medium")).toBe("routine");
    expect(normalizePriority("low")).toBe("cosmetic");
  });

  it("falls back to routine for unknown values", () => {
    expect(normalizePriority("whenever")).toBe("routine");
  });
});

describe("normalizeContractorType", () => {
  it("passes through allowed values and maps synonyms", () => {
    expect(normalizeContractorType("plumber", "plumbing")).toBe("plumber");
    expect(normalizeContractorType("Licensed Electrician", "electrical")).toBe("electrician");
    expect(normalizeContractorType("exterminator", "pest")).toBe("pest control");
  });

  it("falls back based on category for unknown values", () => {
    expect(normalizeContractorType("magician", "hvac")).toBe("hvac technician");
    expect(normalizeContractorType("", "structural")).toBe("general contractor");
  });
});

describe("normalizeTimeline", () => {
  it("passes through allowed values, including dash variations", () => {
    expect(normalizeTimeline("same day", "routine")).toBe("same day");
    expect(normalizeTimeline("24 - 48 hours", "routine")).toBe("24-48 hours");
    expect(normalizeTimeline("1 to 3 days", "routine")).toBe("1-3 days");
  });

  it("maps loose phrasings onto the closed set", () => {
    expect(normalizeTimeline("today", "routine")).toBe("same day");
    expect(normalizeTimeline("within a week", "routine")).toBe("3-7 days");
    expect(normalizeTimeline("about a month", "routine")).toBe("more than 2 weeks");
  });

  it("falls back based on priority for unknown values", () => {
    expect(normalizeTimeline("eventually", "emergency")).toBe("same day");
    expect(normalizeTimeline("eventually", "urgent")).toBe("24-48 hours");
    expect(normalizeTimeline("eventually", "cosmetic")).toBe("1-2 weeks");
  });
});

describe("normalizeMaintenanceAnalysis", () => {
  it("accepts a valid analysis unchanged", () => {
    const result = normalizeMaintenanceAnalysis(validRawAnalysis());
    expect(result).not.toBeNull();
    expect(result?.category).toBe("plumbing");
    expect(result?.estimatedTimeline).toBe("24-48 hours");
    expect(result?.confidenceScore).toBe(0.85);
  });

  it("repairs out-of-range and off-enum values instead of failing", () => {
    const result = normalizeMaintenanceAnalysis({
      ...validRawAnalysis(),
      category: "Heating",
      priority: "HIGH",
      estimatedTimeline: "in a few days",
      contractorType: "AC repair person",
      estimatedCostLow: 500.4,
      estimatedCostHigh: 200,
      confidenceScore: 1.7
    });

    expect(result).not.toBeNull();
    expect(result?.category).toBe("hvac");
    expect(result?.priority).toBe("urgent");
    expect(result?.estimatedTimeline).toBe("1-3 days");
    expect(result?.contractorType).toBe("hvac technician");
    expect(result?.estimatedCostLow).toBe(500);
    expect(result?.estimatedCostHigh).toBe(500);
    expect(result?.confidenceScore).toBe(1);
  });

  it("trims summaries to two sentences and causes to one", () => {
    const result = normalizeMaintenanceAnalysis({
      ...validRawAnalysis(),
      issueSummary: "First sentence here. Second sentence here. Third sentence should be dropped.",
      likelyCause: "The seal failed. Additionally there could be other causes."
    });

    expect(result?.issueSummary).toBe("First sentence here. Second sentence here.");
    expect(result?.likelyCause).toBe("The seal failed.");
  });

  it("returns null for structurally invalid payloads", () => {
    expect(normalizeMaintenanceAnalysis(null)).toBeNull();
    expect(normalizeMaintenanceAnalysis({})).toBeNull();
    expect(normalizeMaintenanceAnalysis({ ...validRawAnalysis(), estimatedCostLow: "cheap" })).toBeNull();
    expect(normalizeMaintenanceAnalysis({ ...validRawAnalysis(), title: undefined })).toBeNull();
  });

  it("returns null when normalized text still violates the strict schema", () => {
    expect(normalizeMaintenanceAnalysis({ ...validRawAnalysis(), issueSummary: "Short." })).toBeNull();
    expect(normalizeMaintenanceAnalysis({ ...validRawAnalysis(), title: "X" })).toBeNull();
  });
});
