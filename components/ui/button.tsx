import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "border-[var(--brand)] bg-[linear-gradient(180deg,#1f6b5f,#174a43)] text-white shadow-[0_18px_35px_rgba(22,74,67,0.28)] hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(22,74,67,0.34)]",
        variant === "secondary" &&
          "border-[var(--line-strong)] bg-[var(--panel-strong)] text-[var(--text)] shadow-[0_14px_30px_rgba(15,23,42,0.07)] hover:-translate-y-0.5 hover:border-[var(--brand)]/20 hover:bg-white",
        variant === "ghost" && "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]",
        variant === "danger" &&
          "border-[var(--danger)] bg-[linear-gradient(180deg,#d13b32,#b42318)] text-white shadow-[0_18px_35px_rgba(180,35,24,0.22)] hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(180,35,24,0.28)]",
        className
      )}
      {...props}
    />
  );
}
