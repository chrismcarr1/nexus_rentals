import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("section-header", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <h2 className="section-title mt-1 text-lg font-semibold text-[var(--text)]">{title}</h2>
        {description ? <p className="section-description mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="section-actions flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
