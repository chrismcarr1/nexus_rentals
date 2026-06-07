import { cn } from "@/lib/utils";

export function AdminStatGrid({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn("ops-grid", className)}>{children}</section>;
}
