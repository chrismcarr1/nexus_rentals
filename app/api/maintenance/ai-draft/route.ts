import { analyzeMaintenanceRequest } from "@/lib/ai-maintenance";
import { getCurrentUser } from "@/lib/auth";
import { filterSubmittedAssetPaths } from "@/lib/file-security";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in before generating a maintenance draft." }, { status: 401 });
  }

  const rateLimit = checkRateLimit({
    key: `maintenance-ai:${user.id}`,
    limit: 10,
    windowMs: 60 * 1000
  });

  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many AI draft requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid draft request." }, { status: 400 });
  }

  const payload = body as { imagePaths?: unknown; description?: unknown };
  const imagePaths = Array.isArray(payload.imagePaths)
    ? filterSubmittedAssetPaths(payload.imagePaths.map(String), user, 3)
    : [];
  const description = typeof payload.description === "string" ? payload.description.trim() : "";

  if (imagePaths.length === 0 && !description) {
    return Response.json(
      { error: "Describe the issue or upload at least one photo before generating a draft." },
      { status: 400 }
    );
  }

  const draft = await analyzeMaintenanceRequest({ description, imagePaths });
  if (!draft) {
    return Response.json(
      { error: "Could not generate an AI maintenance draft. Try again, or fill in the fields manually." },
      { status: 502 }
    );
  }

  return Response.json({ draft });
}
