import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";

import { isAllowedStoredAssetPath, isRemoteAssetUrl } from "@/lib/file-security";

export const AI_MAINTENANCE_DISCLAIMER =
  "AI estimates are informational and should be verified by a qualified professional.";

type AnalyzeMaintenanceInput = {
  description: string;
  imagePaths?: string[];
};

export const aiCategories = [
  "plumbing",
  "hvac",
  "electrical",
  "appliance",
  "pest",
  "cosmetic",
  "structural",
  "exterior",
  "safety",
  "other"
] as const;

export const aiPriorities = ["emergency", "urgent", "routine", "cosmetic"] as const;

export const aiTimelines = [
  "same day",
  "24-48 hours",
  "1-3 days",
  "3-7 days",
  "1-2 weeks",
  "more than 2 weeks"
] as const;

export const aiContractorTypes = [
  "plumber",
  "electrician",
  "hvac technician",
  "appliance technician",
  "handyman",
  "roofer",
  "pest control",
  "locksmith",
  "general contractor",
  "other"
] as const;

type AiCategory = (typeof aiCategories)[number];
type AiPriority = (typeof aiPriorities)[number];
type AiTimeline = (typeof aiTimelines)[number];
type AiContractorType = (typeof aiContractorTypes)[number];

const categoryToNexus: Record<AiCategory, string> = {
  plumbing: "Plumbing",
  hvac: "Heating / cooling",
  electrical: "Electrical",
  appliance: "Appliance",
  pest: "Pest control",
  cosmetic: "Other",
  structural: "Other",
  exterior: "Common area",
  safety: "Safety",
  other: "Other"
};

const priorityToNexus: Record<AiPriority, "LOW" | "MEDIUM" | "HIGH" | "URGENT"> = {
  emergency: "URGENT",
  urgent: "HIGH",
  routine: "MEDIUM",
  cosmetic: "LOW"
};

const categorySynonyms: Record<string, AiCategory> = {
  "heating / cooling": "hvac",
  heating: "hvac",
  cooling: "hvac",
  "air conditioning": "hvac",
  ac: "hvac",
  furnace: "hvac",
  "pest control": "pest",
  pests: "pest",
  appliances: "appliance",
  roof: "exterior",
  roofing: "exterior",
  siding: "exterior",
  gutters: "exterior",
  landscaping: "exterior",
  paint: "cosmetic",
  painting: "cosmetic",
  drywall: "cosmetic",
  flooring: "cosmetic",
  "common area": "other",
  "safety hazard": "safety"
};

const prioritySynonyms: Record<string, AiPriority> = {
  critical: "emergency",
  immediate: "emergency",
  severe: "emergency",
  high: "urgent",
  asap: "urgent",
  prompt: "urgent",
  medium: "routine",
  normal: "routine",
  standard: "routine",
  moderate: "routine",
  low: "cosmetic",
  minor: "cosmetic"
};

const contractorSynonyms: Record<string, AiContractorType> = {
  hvac: "hvac technician",
  "hvac tech": "hvac technician",
  "hvac contractor": "hvac technician",
  "licensed plumber": "plumber",
  "licensed electrician": "electrician",
  exterminator: "pest control",
  "pest control technician": "pest control",
  "appliance repair": "appliance technician",
  "appliance repair technician": "appliance technician",
  "maintenance technician": "handyman",
  "maintenance tech": "handyman",
  "roofing contractor": "roofer",
  gc: "general contractor",
  contractor: "general contractor"
};

const contractorByCategory: Record<AiCategory, AiContractorType> = {
  plumbing: "plumber",
  hvac: "hvac technician",
  electrical: "electrician",
  appliance: "appliance technician",
  pest: "pest control",
  cosmetic: "handyman",
  structural: "general contractor",
  exterior: "general contractor",
  safety: "general contractor",
  other: "handyman"
};

const timelineByPriority: Record<AiPriority, AiTimeline> = {
  emergency: "same day",
  urgent: "24-48 hours",
  routine: "3-7 days",
  cosmetic: "1-2 weeks"
};

const MAX_COST = 100000;

export type MaintenanceAiDraft = {
  title: string;
  category: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  description: string;
  estimatedLow: number;
  estimatedHigh: number;
  estimatedCost: number;
  timeline: string;
  likelyCause: string;
  recommendedRepair: string;
  contractorType: AiContractorType;
  estimatedTimeline: AiTimeline;
  safetyConcern: "NO" | "YES";
  safetyNotes: string;
  confidenceScore: number;
};

type OpenAiOutputContent = {
  type?: string;
  text?: string;
};

type OpenAiOutputItem = {
  type?: string;
  content?: OpenAiOutputContent[];
};

type OpenAiResponse = {
  output_text?: string;
  output?: OpenAiOutputItem[];
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
  error?: {
    message?: string;
  };
};

const publicDir = path.join(process.cwd(), "public");

const mimeTypeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

// Stage 1: shape check on the raw model output. Values are normalized afterward,
// so this stays loose on content and strict only on structure.
const rawAnalysisSchema = z.object({
  title: z.string(),
  category: z.string(),
  priority: z.string(),
  issueSummary: z.string(),
  likelyCause: z.string(),
  recommendedRepair: z.string(),
  estimatedCostLow: z.number(),
  estimatedCostHigh: z.number(),
  estimatedTimeline: z.string(),
  contractorType: z.string(),
  confidenceScore: z.number(),
  safetyNotes: z.string()
});

// Stage 2: strict gate on the normalized result. Nothing leaves this module
// unless it satisfies these enums and constraints.
const normalizedAnalysisSchema = z
  .object({
    title: z.string().min(2).max(75),
    category: z.enum(aiCategories),
    priority: z.enum(aiPriorities),
    issueSummary: z.string().min(10).max(400),
    likelyCause: z.string().min(3).max(250),
    recommendedRepair: z.string().min(3).max(350),
    estimatedCostLow: z.number().min(0).max(MAX_COST),
    estimatedCostHigh: z.number().min(0).max(MAX_COST),
    estimatedTimeline: z.enum(aiTimelines),
    contractorType: z.enum(aiContractorTypes),
    confidenceScore: z.number().min(0).max(1),
    safetyNotes: z.string().max(300)
  })
  .refine((analysis) => analysis.estimatedCostHigh >= analysis.estimatedCostLow, {
    message: "estimatedCostHigh must be greater than or equal to estimatedCostLow"
  });

export type MaintenanceAiAnalysis = z.infer<typeof normalizedAnalysisSchema>;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "category",
    "priority",
    "issueSummary",
    "likelyCause",
    "recommendedRepair",
    "estimatedCostLow",
    "estimatedCostHigh",
    "estimatedTimeline",
    "contractorType",
    "confidenceScore",
    "safetyNotes"
  ],
  properties: {
    title: {
      type: "string",
      description: "A short professional maintenance request title, 3 to 7 words, no trailing period."
    },
    category: {
      type: "string",
      enum: aiCategories,
      description: "The closest maintenance category for the reported issue."
    },
    priority: {
      type: "string",
      enum: aiPriorities,
      description:
        "emergency: immediate hazard or active ongoing damage; urgent: needs prompt attention; routine: standard repair; cosmetic: appearance only."
    },
    issueSummary: {
      type: "string",
      description: "Exactly two sentences describing the issue for residents and managers."
    },
    likelyCause: {
      type: "string",
      description: "One concise sentence stating the most likely cause. State uncertainty plainly."
    },
    recommendedRepair: {
      type: "string",
      description: "One concise sentence stating the recommended repair or next diagnostic step."
    },
    estimatedCostLow: {
      type: "number",
      description: "A realistic low-end repair estimate in whole US dollars."
    },
    estimatedCostHigh: {
      type: "number",
      description:
        "A realistic high-end repair estimate in whole US dollars. Must be greater than or equal to estimatedCostLow."
    },
    estimatedTimeline: {
      type: "string",
      enum: aiTimelines,
      description: "Expected repair timeline. Pick exactly one of the listed options."
    },
    contractorType: {
      type: "string",
      enum: aiContractorTypes,
      description: "The trade best suited for this repair. Pick exactly one of the listed options."
    },
    confidenceScore: {
      type: "number",
      description: "Confidence from 0 to 1 based on how clearly the description and photos show the issue."
    },
    safetyNotes: {
      type: "string",
      description: "Safety warnings when applicable (gas, electrical, water near wiring, structural). Empty string when none."
    }
  }
};

function cleanImagePath(imagePath: string) {
  return imagePath.split("?")[0]?.split("#")[0] ?? imagePath;
}

function getImageMimeType(imagePath: string) {
  const extension = path.extname(cleanImagePath(imagePath)).toLowerCase().replace(/^\./, "");
  return mimeTypeByExtension[extension] ?? "image/jpeg";
}

async function localImagePathToDataUrl(imagePath: string) {
  const cleanedPath = decodeURIComponent(cleanImagePath(imagePath));
  const normalizedPath = cleanedPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicDir, normalizedPath);

  if (!absolutePath.startsWith(publicDir + path.sep)) {
    throw new Error("Invalid local image path.");
  }

  const bytes = await readFile(absolutePath);
  return `data:${getImageMimeType(imagePath)};base64,${bytes.toString("base64")}`;
}

async function toOpenAiImageContent(imagePath: string) {
  if (!isAllowedStoredAssetPath(imagePath)) {
    throw new Error("Invalid maintenance image path.");
  }

  if (isRemoteAssetUrl(imagePath)) {
    return {
      type: "input_image",
      image_url: imagePath,
      detail: "high"
    };
  }

  return {
    type: "input_image",
    image_url: await localImagePathToDataUrl(imagePath),
    detail: "high"
  };
}

function firstTextBlock(items: OpenAiOutputItem[]): string | null {
  for (const item of items) {
    for (const block of item.content ?? []) {
      if (typeof block.text === "string" && block.text.trim()) {
        return block.text.trim();
      }
    }
  }
  return null;
}

// Resilient extraction for the Responses API. `output_text` is an SDK-only
// convenience field and is absent from raw HTTP responses, so we fall back to
// walking `output`: prefer message items, then any item carrying a text block.
function extractResponseText(response: OpenAiResponse): string | null {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const items = Array.isArray(response.output) ? response.output : [];
  const messageItems = items.filter((item) => item.type === "message");
  return firstTextBlock(messageItems) ?? firstTextBlock(items);
}

// First 500 chars, whitespace-collapsed, for diagnostics. The Responses payload
// only echoes the model's own output (never the API key or uploaded image data),
// so this is safe to log.
function safePreview(value: string) {
  return collapseWhitespace(value).slice(0, 500);
}

// Strips markdown fences then parses + validates. Returns null on any failure
// (invalid JSON or schema violation) rather than throwing.
export function parseMaintenanceJson(raw: string): MaintenanceAiAnalysis | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  return normalizeMaintenanceAnalysis(parsed);
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function limitSentences(value: string, maxSentences: number) {
  const text = collapseWhitespace(value);
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!sentences) return text;
  return sentences.slice(0, maxSentences).join("").trim();
}

function normalizeTitle(value: string) {
  const words = collapseWhitespace(value).replace(/[.\s]+$/, "").split(" ");
  return words.slice(0, 10).join(" ").slice(0, 90);
}

function matchEnum<T extends string>(value: string, allowed: readonly T[], synonyms: Record<string, T>): T | null {
  const cleaned = collapseWhitespace(value).toLowerCase();
  if ((allowed as readonly string[]).includes(cleaned)) return cleaned as T;
  return synonyms[cleaned] ?? null;
}

export function normalizeCategory(value: string): AiCategory {
  return matchEnum(value, aiCategories, categorySynonyms) ?? "other";
}

export function normalizePriority(value: string): AiPriority {
  return matchEnum(value, aiPriorities, prioritySynonyms) ?? "routine";
}

export function normalizeContractorType(value: string, category: AiCategory): AiContractorType {
  return matchEnum(value, aiContractorTypes, contractorSynonyms) ?? contractorByCategory[category];
}

export function normalizeTimeline(value: string, priority: AiPriority): AiTimeline {
  const cleaned = collapseWhitespace(value)
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/(\d)\s*to\s*(\d)/g, "$1-$2");

  for (const option of aiTimelines) {
    if (cleaned === option.replace(/\s*-\s*/g, "-")) return option;
  }

  if (/same.?day|today|immediate/.test(cleaned)) return "same day";
  if (/24|48|next day|tomorrow|1-2 day/.test(cleaned)) return "24-48 hours";
  if (/1-3 day|2-3 day|few day/.test(cleaned)) return "1-3 days";
  if (/3-7 day|4-7|within a week|this week/.test(cleaned)) return "3-7 days";
  if (/1-2 week|10 day|14 day|two week/.test(cleaned)) return "1-2 weeks";
  if (/more than 2 week|2\+ week|3 week|month|several week/.test(cleaned)) return "more than 2 weeks";

  return timelineByPriority[priority];
}

function normalizeCost(value: number) {
  return Math.min(MAX_COST, Math.max(0, Math.round(value)));
}

function clampConfidence(value: number) {
  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}

// Maps a raw (already shape-checked) model response onto the closed enum sets and
// numeric bounds, then runs the strict schema as the final gate. Returns null
// instead of letting malformed data through.
export function normalizeMaintenanceAnalysis(raw: unknown): MaintenanceAiAnalysis | null {
  const shape = rawAnalysisSchema.safeParse(raw);
  if (!shape.success) return null;

  const data = shape.data;
  const category = normalizeCategory(data.category);
  const priority = normalizePriority(data.priority);
  const estimatedCostLow = normalizeCost(data.estimatedCostLow);
  const estimatedCostHigh = Math.max(estimatedCostLow, normalizeCost(data.estimatedCostHigh));

  const normalized = {
    title: normalizeTitle(data.title),
    category,
    priority,
    issueSummary: limitSentences(data.issueSummary, 2).slice(0, 350),
    likelyCause: limitSentences(data.likelyCause, 1).slice(0, 250),
    recommendedRepair: limitSentences(data.recommendedRepair, 1).slice(0, 300),
    estimatedCostLow,
    estimatedCostHigh,
    estimatedTimeline: normalizeTimeline(data.estimatedTimeline, priority),
    contractorType: normalizeContractorType(data.contractorType, category),
    confidenceScore: clampConfidence(data.confidenceScore),
    safetyNotes: collapseWhitespace(data.safetyNotes).slice(0, 300)
  };

  const validated = normalizedAnalysisSchema.safeParse(normalized);
  return validated.success ? validated.data : null;
}

function buildPrompt(description: string, hasImages: boolean) {
  return [
    "You are a senior residential property maintenance coordinator triaging a tenant request for Nexus Rentals.",
    hasImages
      ? "Analyze the tenant's written description together with the attached photos. Be specific about visible damage, materials, and what should be confirmed in person."
      : "Analyze the tenant's written description. No photos were provided, so note what an on-site visit should confirm.",
    "Do not fill or infer property, unit, tenant identity, or exact room/location.",
    "If the issue is unclear, say what is unclear and lower the confidence score. Do not pretend to know causes, hidden damage, code violations, mold, or electrical safety without evidence.",
    "Estimate costs in US dollars as planning ranges for residential rental maintenance. Include labor/material uncertainty in the range.",
    "Use the priority scale strictly: emergency only for immediate hazards or active ongoing damage.",
    "Formatting rules: title is 3 to 7 words; issueSummary is exactly two sentences; likelyCause and recommendedRepair are one sentence each.",
    "Pick category, priority, estimatedTimeline, and contractorType only from their allowed values. Never invent new labels.",
    "Include safetyNotes only when there is a genuine safety consideration; otherwise return an empty string.",
    `Tenant description: ${description.trim() || "none provided."}`
  ].join("\n");
}

function toDraft(analysis: MaintenanceAiAnalysis): MaintenanceAiDraft {
  const { estimatedCostLow, estimatedCostHigh } = analysis;
  const estimatedCost = Math.round((estimatedCostLow + estimatedCostHigh) / 2);
  const safetyNotes = analysis.safetyNotes;

  const description = [
    analysis.issueSummary,
    "",
    `Likely cause: ${analysis.likelyCause}`,
    `Recommended repair: ${analysis.recommendedRepair}`,
    safetyNotes ? `Safety: ${safetyNotes}` : null
  ]
    .filter((line) => line !== null)
    .join("\n");

  const timeline = [
    `Estimated cost range: $${estimatedCostLow.toLocaleString()} - $${estimatedCostHigh.toLocaleString()}.`,
    `Estimated timeline: ${analysis.estimatedTimeline}.`,
    `Recommended contractor: ${analysis.contractorType}.`,
    AI_MAINTENANCE_DISCLAIMER
  ].join(" ");

  return {
    title: analysis.title,
    category: categoryToNexus[analysis.category],
    priority: priorityToNexus[analysis.priority],
    description,
    estimatedLow: estimatedCostLow,
    estimatedHigh: estimatedCostHigh,
    estimatedCost,
    timeline,
    likelyCause: analysis.likelyCause,
    recommendedRepair: analysis.recommendedRepair,
    contractorType: analysis.contractorType,
    estimatedTimeline: analysis.estimatedTimeline,
    safetyConcern: safetyNotes ? "YES" : "NO",
    safetyNotes,
    confidenceScore: analysis.confidenceScore
  };
}

async function requestAnalysis(input: AnalyzeMaintenanceInput): Promise<MaintenanceAiDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI is not configured. Add OPENAI_API_KEY to your environment variables.");
  }

  const imagePaths = (input.imagePaths ?? []).slice(0, 3);
  const imageContent = await Promise.all(imagePaths.map(toOpenAiImageContent));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MAINTENANCE_MODEL ?? "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt(input.description, imageContent.length > 0)
            },
            ...imageContent
          ]
        }
      ],
      // gpt-5-mini is a reasoning model: leave generous headroom so reasoning
      // tokens cannot truncate the JSON message (a truncated body is the usual
      // cause of "not valid JSON"). Keep reasoning effort low to limit spend.
      max_output_tokens: 2048,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "maintenance_ai_analysis",
          strict: true,
          schema: responseSchema
        }
      }
    })
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI could not analyze the maintenance request.");
  }

  const rawText = extractResponseText(payload);
  if (!rawText) {
    console.error(
      "[ai-maintenance] OpenAI response contained no text output.",
      `status=${payload.status ?? "unknown"}`,
      payload.incomplete_details?.reason ? `reason=${payload.incomplete_details.reason}` : "",
      `output=${safePreview(JSON.stringify(payload.output ?? []))}`
    );
    throw new Error("OpenAI returned an empty maintenance analysis.");
  }

  const analysis = parseMaintenanceJson(rawText);
  if (!analysis) {
    console.error(
      "[ai-maintenance] Could not parse or validate analysis JSON.",
      payload.status ? `status=${payload.status}` : "",
      payload.incomplete_details?.reason ? `reason=${payload.incomplete_details.reason}` : "",
      `preview=${safePreview(rawText)}`
    );
    throw new Error("OpenAI returned a maintenance analysis that was not valid JSON.");
  }

  return toDraft(analysis);
}

// Never throws: any failure (config, network, malformed output, validation) is
// logged and surfaced as null so the maintenance flow can continue without AI.
export async function analyzeMaintenanceRequest(input: AnalyzeMaintenanceInput): Promise<MaintenanceAiDraft | null> {
  try {
    return await requestAnalysis(input);
  } catch (error) {
    console.error("[ai-maintenance] Maintenance analysis failed", error);
    return null;
  }
}
