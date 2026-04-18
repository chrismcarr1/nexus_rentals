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
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
        tone === "default" && "bg-stone-900/5 text-stone-700",
        tone === "success" && "bg-emerald-700/10 text-emerald-800",
        tone === "warning" && "bg-amber-500/15 text-amber-900",
        tone === "danger" && "bg-red-700/10 text-red-800"
      )}
    >
      {children}
    </span>
  );
}
