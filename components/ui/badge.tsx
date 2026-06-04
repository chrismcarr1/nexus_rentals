import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "default"
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold tracking-[0.02em]",
        tone === "default" && "border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted-strong)]",
        tone === "success" && "border border-emerald-600/15 bg-emerald-600/10 text-emerald-800",
        tone === "warning" && "border border-amber-600/18 bg-amber-500/12 text-amber-800",
        tone === "danger" && "border border-red-600/15 bg-red-600/10 text-red-700"
      )}
    >
      {children}
    </span>
  );
}
