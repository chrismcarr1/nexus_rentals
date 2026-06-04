import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-sm font-semibold transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "border-[var(--brand)] bg-[var(--brand)] text-white shadow-[0_10px_22px_rgba(13,143,123,0.18)] hover:bg-[var(--brand-strong)]",
        variant === "secondary" &&
          "border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]",
        variant === "ghost" && "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        variant === "danger" &&
          "border-[var(--danger)] bg-[var(--danger)] text-white shadow-[0_10px_22px_rgba(220,38,38,0.16)] hover:bg-red-700",
        className
      )}
      {...props}
    />
  );
}
