import { Badge } from "@/components/ui/badge";

function toneFor(value: string) {
  const status = value.toLowerCase();
  if (["active", "ready", "success", "paid", "connected", "healthy", "configured", "accepted", "completed", "enabled", "submitted", "valid", "available"].some((item) => status.includes(item))) {
    return "success" as const;
  }
  if (["critical", "failed", "blocked", "disabled", "late", "suspended", "missing"].some((item) => status.includes(item))) {
    return "danger" as const;
  }
  if (["warning", "pending", "setup", "unpaid", "partial", "review", "not invited", "no account"].some((item) => status.includes(item))) {
    return "warning" as const;
  }
  return "default" as const;
}

export function AdminStatusBadge({
  status,
  tone
}: {
  status: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return <Badge tone={tone ?? toneFor(status)}>{status}</Badge>;
}
