import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-[var(--brand)] text-white shadow-lg shadow-emerald-950/10 hover:opacity-95",
        variant === "secondary" && "border border-[var(--line)] bg-white/80 text-[var(--text)] hover:bg-white",
        variant === "ghost" && "text-[var(--muted)] hover:bg-white/70",
        variant === "danger" && "bg-[var(--danger)] text-white hover:opacity-90",
        className
      )}
      {...props}
    />
  );
}
