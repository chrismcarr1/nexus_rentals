import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DetailPanel({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cn("detail-panel", className)} {...props}>
      {children}
    </section>
  );
}
