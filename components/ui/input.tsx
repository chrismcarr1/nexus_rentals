import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "field text-sm placeholder:text-[#9aa5a1]",
        className
      )}
      {...props}
    />
  );
}
