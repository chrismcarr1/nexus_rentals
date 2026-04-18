type DamageAssessmentInput = {
  notes?: string;
  imagePaths: string[];
  baselinePaths?: string[];
};

const damageCatalog = [
  { key: "wall damage", weight: 1.1, low: 150, high: 600, severity: "LOW" },
  { key: "paint damage", weight: 0.9, low: 120, high: 450, severity: "LOW" },
  { key: "flooring damage", weight: 1.6, low: 600, high: 2200, severity: "MODERATE" },
  { key: "carpet damage", weight: 1.4, low: 350, high: 1400, severity: "MODERATE" },
  { key: "appliance damage", weight: 1.8, low: 450, high: 2600, severity: "HIGH" },
  { key: "broken fixtures", weight: 1.2, low: 180, high: 900, severity: "MODERATE" },
  { key: "door/window damage", weight: 1.7, low: 300, high: 1800, severity: "HIGH" },
  { key: "water damage", weight: 2.3, low: 900, high: 5000, severity: "CRITICAL" }
];

function guessCategory(notes: string) {
  const normalized = notes.toLowerCase();
  const matches = damageCatalog.filter((entry) => normalized.includes(entry.key.split(" ")[0]));
  if (matches.length) return matches;
  return [damageCatalog[normalized.length % damageCatalog.length], damageCatalog[(normalized.length + 3) % damageCatalog.length]];
}

export function generateDamageEstimate(input: DamageAssessmentInput) {
  const notes = input.notes?.trim() || "General move-out inspection with visible finish and fixture issues.";
  const categories = guessCategory(notes);
  const imageFactor = Math.max(1, input.imagePaths.length * 0.55);
  const baselineFactor = input.baselinePaths?.length ? 1.12 : 1;

  const low = Math.round(categories.reduce((sum, item) => sum + item.low * item.weight, 0) * imageFactor * baselineFactor);
  const high = Math.round(categories.reduce((sum, item) => sum + item.high * item.weight, 0) * imageFactor * baselineFactor);
  const severityRank = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
  const severity = categories
    .map((item) => item.severity)
    .sort((a, b) => severityRank.indexOf(b as never) - severityRank.indexOf(a as never))[0] as
    | "LOW"
    | "MODERATE"
    | "HIGH"
    | "CRITICAL";
  const confidence = Number(Math.min(0.94, 0.61 + input.imagePaths.length * 0.07 + (input.baselinePaths?.length ? 0.08 : 0))).toFixed(2);
  const wearAndTear = notes.toLowerCase().includes("wear") || notes.toLowerCase().includes("scuff");

  return {
    summary: `${severity.toLowerCase()}-severity assessment with likely ${categories.map((item) => item.key).join(", ")} impacts.`,
    damageCategories: categories.map((item) => item.key).join(", "),
    severity,
    confidenceScore: Number(confidence),
    estimatedLow: low,
    estimatedHigh: high,
    wearAndTear,
    explanation:
      "Estimate blends probable material replacement, repainting or restoration labor, and a localized contingency factor based on image count and presence of baseline comparison photos. This is a planning estimate, not a legal or insurance valuation.",
    recommendedNext:
      severity === "CRITICAL"
        ? "Schedule an in-person contractor inspection within 48 hours, document moisture or structural exposure, and preserve tenant communication history."
        : "Capture one additional wide-angle photo set, request two contractor quotes, and review lease language before withholding any deposit funds."
  };
}
