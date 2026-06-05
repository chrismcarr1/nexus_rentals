import { getCurrentUser } from "@/lib/auth";
import { getEmailDiagnostics, probeEmailWorker } from "@/lib/email";
import { UserRole } from "@/lib/store";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Log in before checking email diagnostics." }, { status: 401 });
  }

  if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
    return Response.json({ error: "Only managers and admins can check email diagnostics." }, { status: 403 });
  }

  const url = new URL(request.url);
  const shouldProbeWorker = url.searchParams.get("probe") === "1";
  const diagnostics = getEmailDiagnostics();

  return Response.json({
    diagnostics,
    workerProbe: shouldProbeWorker ? await probeEmailWorker() : null
  });
}
