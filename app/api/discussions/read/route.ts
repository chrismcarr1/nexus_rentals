import { NextRequest, NextResponse } from "next/server";

import { requireRoles } from "@/lib/auth";
import { markDiscussionConversationRead } from "@/lib/discussions";
import { UserRole } from "@/lib/store";

export async function GET(request: NextRequest) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.TENANT]);
  const conversationKey = request.nextUrl.searchParams.get("conversation")?.trim() ?? "";

  if (conversationKey) {
    await markDiscussionConversationRead(user, conversationKey);
  }

  const destination = new URL("/messages", request.url);
  if (conversationKey) destination.searchParams.set("conversation", conversationKey);
  return NextResponse.redirect(destination);
}
