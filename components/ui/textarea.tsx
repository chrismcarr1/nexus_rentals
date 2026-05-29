import * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-xl border border-[var(--line)] bg-white/90 px-4 py-3 text-sm text-[var(--text)] shadow-sm outline-none transition placeholder:text-stone-400 focus:border-[rgba(24,76,69,0.4)] focus:ring-4 focus:ring-emerald-900/5",
        className
      )}
      {...props}
    />
  );
}
