import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass card-shadow rounded-[28px] border border-white/60", className)} {...props} />;
}
