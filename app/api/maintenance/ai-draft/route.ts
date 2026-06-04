import { getCurrentUser } from "@/lib/auth";
import { filterSubmittedAssetPaths } from "@/lib/file-security";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateMaintenancePhotoDraft } from "@/services/maintenance-estimator";

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

  const payload = body as { imagePaths?: unknown; notes?: unknown };
  const imagePaths = Array.isArray(payload.imagePaths)
    ? filterSubmittedAssetPaths(payload.imagePaths.map(String), user, 3)
    : [];

  if (imagePaths.length === 0) {
    return Response.json({ error: "Upload at least one photo before generating a draft." }, { status: 400 });
  }

  try {
    const draft = await generateMaintenancePhotoDraft({
      imagePaths,
      notes: typeof payload.notes === "string" ? payload.notes : undefined
    });

    return Response.json({ draft });
  } catch (error) {
    console.error("[maintenance-ai] Failed to generate draft", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not generate an AI maintenance draft."
      },
      { status: 500 }
    );
  }
}
