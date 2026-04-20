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
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.02em]",
        tone === "default" && "border-slate-200 bg-slate-100 text-slate-700",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "danger" && "border-red-200 bg-red-50 text-red-800"
      )}
    >
      {children}
    </span>
  );
}
