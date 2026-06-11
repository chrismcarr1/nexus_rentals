import { NextRequest, NextResponse } from "next/server";

import { requireRoles } from "@/lib/auth";
import { markDiscussionConversationRead } from "@/lib/discussions";
import { UserRole } from "@/lib/store";

// Marking a conversation read is a state change, so it must not be reachable via
// GET (which is CSRF-able through <img>/link prefetch under SameSite=Lax). POST
// plus a same-origin check ensures only first-party requests can trigger it.
function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Same-origin fetches may omit Origin; cookie SameSite still applies.
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const user = await requireRoles([UserRole.MANAGER, UserRole.TENANT]);

  let conversationKey = "";
  try {
    const body = (await request.json()) as { conversation?: unknown };
    conversationKey = typeof body.conversation === "string" ? body.conversation.trim() : "";
  } catch {
    conversationKey = "";
  }

  if (conversationKey) {
    await markDiscussionConversationRead(user, conversationKey);
  }

  return NextResponse.json({ ok: true });
}
