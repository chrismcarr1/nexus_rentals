import { Badge } from "@/components/ui/badge";
import type { ListingStatus } from "@/lib/store";

const STATUS: Record<ListingStatus, { label: string; tone: "default" | "success" | "warning" }> = {
  draft: { label: "Draft", tone: "warning" },
  active: { label: "Active", tone: "success" },
  unpublished: { label: "Unpublished", tone: "default" }
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const view = STATUS[status] ?? STATUS.draft;
  return <Badge tone={view.tone}>{view.label}</Badge>;
}
