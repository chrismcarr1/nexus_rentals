import { Badge } from "@/components/ui/badge";

export function statusTone(status?: string | null): "default" | "success" | "warning" | "danger" {
  const normalized = String(status ?? "").toUpperCase();
  if (["ACTIVE", "OCCUPIED", "PAID", "APPROVED", "PUBLISHED", "CONVERTED_TO_LEASE", "RESOLVED", "CLOSED", "LOW"].includes(normalized)) return "success";
  if (["VACANT", "TURNOVER", "NOTICE", "UPCOMING", "PENDING", "PARTIAL", "DRAFT", "SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS", "OPEN", "MEDIUM", "HIGH"].includes(normalized)) return "warning";
  if (["URGENT", "ARCHIVED", "LATE", "EXPIRED", "TERMINATED", "REJECTED", "WITHDRAWN", "CANCELLED", "ENDED"].includes(normalized)) return "danger";
  return "default";
}

export function humanizeStatus(value?: string | null) {
  return String(value ?? "Unknown")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function StatusBadge({
  status,
  tone
}: {
  status?: string | null;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return <Badge tone={tone ?? statusTone(status)}>{humanizeStatus(status)}</Badge>;
}
