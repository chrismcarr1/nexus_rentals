import { NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/request-origin";
import { SCREENING_ACCESS_COOKIE } from "@/lib/screening/applicant-access";
import { findApplicationByAccessToken } from "@/lib/screening/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const application = await findApplicationByAccessToken(token);
  if (!application) {
    return NextResponse.redirect(new URL("/login?error=screening-link-expired", `${getAppBaseUrl()}/`));
  }
  const response = NextResponse.redirect(
    new URL(`/screening/${encodeURIComponent(application.id)}`, `${getAppBaseUrl()}/`)
  );
  response.cookies.set(SCREENING_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
