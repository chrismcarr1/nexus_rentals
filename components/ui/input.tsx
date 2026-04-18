import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-3 text-sm text-[var(--text)] shadow-sm outline-none transition placeholder:text-stone-400 focus:border-[rgba(24,76,69,0.4)] focus:ring-4 focus:ring-emerald-900/5",
        className
      )}
      {...props}
    />
  );
}
