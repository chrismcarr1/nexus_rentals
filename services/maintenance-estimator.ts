import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";

import { isAllowedStoredAssetPath, isRemoteAssetUrl } from "@/lib/file-security";

type MaintenancePhotoDraftInput = {
  imagePaths: string[];
  notes?: string;
};

export type MaintenancePhotoDraft = {
  category: string;
  title: string;
  description: string;
  estimatedLow: number;
  estimatedHigh: number;
  estimatedCost: number;
  accessNotes: string;
  timeline: string;
  confidenceScore: number;
  explanation: string;
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
  error?: {
    message?: string;
  };
};

const model = process.env.OPENAI_MAINTENANCE_MODEL || "gpt-5.5";
const publicDir = path.join(process.cwd(), "public");
const allowedCategories = [
  "Plumbing",
  "Electrical",
  "Heating / cooling",
  "Appliance",
  "Pest control",
  "Doors / windows",
  "Flooring",
  "Common area",
  "Safety",
  "Other"
] as const;

const mimeTypeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

const draftSchema = z.object({
  category: z.enum(allowedCategories),
  title: z.string().min(2).max(90),
  description: z.string().min(20).max(1500),
  estimatedLow: z.number().min(0).max(100000),
  estimatedHigh: z.number().min(0).max(100000),
  estimatedCost: z.number().min(0).max(100000),
  accessNotes: z.string().min(5).max(700),
  timeline: z.string().min(10).max(900),
  confidenceScore: z.number().min(0).max(1),
  explanation: z.string().min(10).max(900)
});

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "title",
    "description",
    "estimatedLow",
    "estimatedHigh",
    "estimatedCost",
    "accessNotes",
    "timeline",
    "confidenceScore",
    "explanation"
  ],
  properties: {
    category: {
      type: "string",
      enum: allowedCategories,
      description: "The closest maintenance category for the visible issue."
    },
    title: {
      type: "string",
      description: "A short maintenance request title based only on visible evidence and user notes."
    },
    description: {
      type: "string",
      description:
        "A resident- and manager-readable description of the visible condition, likely issue, what should be checked, and what cannot be confirmed from photos alone."
    },
    estimatedLow: {
      type: "number",
      description: "A realistic low-end repair estimate in whole US dollars."
    },
    estimatedHigh: {
      type: "number",
      description: "A realistic high-end repair estimate in whole US dollars."
    },
    estimatedCost: {
      type: "number",
      description: "A practical midpoint planning estimate in whole US dollars."
    },
    accessNotes: {
      type: "string",
      description: "Short access or triage notes a manager should confirm before dispatch."
    },
    timeline: {
      type: "string",
      description: "Recommended next step and expected urgency without using a priority label."
    },
    confidenceScore: {
      type: "number",
      description: "Confidence from 0 to 1 based on how clearly the photos show the issue."
    },
    explanation: {
      type: "string",
      description: "Briefly explain what visual evidence drove the category, cost range, and next step."
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

function extractOutputText(response: OpenAiResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("OpenAI returned no maintenance draft text.");
  }

  return text;
}

function roundCurrency(value: number) {
  return Math.max(0, Math.round(value));
}

function normalizeDraft(draft: MaintenancePhotoDraft): MaintenancePhotoDraft {
  const estimatedLow = roundCurrency(draft.estimatedLow);
  const estimatedHigh = Math.max(estimatedLow, roundCurrency(draft.estimatedHigh));
  const midpoint = roundCurrency(draft.estimatedCost);
  const estimatedCost = Math.min(Math.max(midpoint, estimatedLow), estimatedHigh);

  return {
    category: draft.category,
    title: draft.title.trim(),
    description: draft.description.trim(),
    estimatedLow,
    estimatedHigh,
    estimatedCost,
    accessNotes: draft.accessNotes.trim(),
    timeline: draft.timeline.trim(),
    confidenceScore: Number(draft.confidenceScore.toFixed(2)),
    explanation: draft.explanation.trim()
  };
}

function buildPrompt(input: MaintenancePhotoDraftInput) {
  const notes = input.notes?.trim();

  return [
    "You are a senior residential property maintenance coordinator reviewing uploaded photos for Nexus Rentals.",
    "Inspect the images directly and create a maintenance request draft. Be specific about visible damage, visible materials, likely trade needed, and what should be confirmed in person.",
    "Do not fill or infer property, unit, tenant identity, exact room/location, priority, or safety concern fields.",
    "If the photos are unclear, say what is unclear and lower confidence. Do not pretend to know causes, hidden damage, code violations, mold, or electrical safety without visible evidence.",
    "Estimate costs in US dollars as planning ranges for residential rental maintenance. Include labor/material uncertainty in the range.",
    `Use exactly one category: ${allowedCategories.join(", ")}.`,
    notes ? `User notes: ${notes}` : "User notes: none provided."
  ].join("\n");
}

export async function generateMaintenancePhotoDraft(input: MaintenancePhotoDraftInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI is not configured. Add OPENAI_API_KEY to your environment variables.");
  }

  const imagePaths = input.imagePaths.slice(0, 3);
  const imageContent = await Promise.all(imagePaths.map(toOpenAiImageContent));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt(input)
            },
            ...imageContent
          ]
        }
      ],
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "maintenance_photo_draft",
          strict: true,
          schema: responseSchema
        }
      }
    })
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI could not generate a maintenance draft.");
  }

  const parsed = draftSchema.safeParse(JSON.parse(extractOutputText(payload)));
  if (!parsed.success) {
    throw new Error("OpenAI returned a maintenance draft in an unexpected format.");
  }

  return normalizeDraft(parsed.data as MaintenancePhotoDraft);
}
