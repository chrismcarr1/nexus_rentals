import "server-only";

import { cookies } from "next/headers";

import { findApplicationByAccessToken } from "@/lib/screening/repository";

export const SCREENING_ACCESS_COOKIE = "nexus_screening_access";

export async function requireApplicantScreeningAccess(applicationId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SCREENING_ACCESS_COOKIE)?.value;
  if (!token) throw new Error("Screening portal access is required.");
  const application = await findApplicationByAccessToken(token);
  if (!application || application.id !== applicationId) {
    throw new Error("This screening portal link is invalid or expired.");
  }
  return application;
}
