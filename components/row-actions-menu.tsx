import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

export function RowActionsMenu({
  label = "Row actions",
  children,
  className
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("row-actions relative inline-block text-left", className)}>
      <summary className="row-actions-trigger" aria-label={label} title={label}>
        <MoreHorizontal className="h-4 w-4" />
      </summary>
      <div className="row-actions-menu">
        {children}
      </div>
    </details>
  );
}

export function RowActionLink({
  href,
  children,
  destructive = false
}: {
  href: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <a
      href={href}
      className={cn(
        "block rounded-md px-3 py-2 text-sm font-medium transition hover:bg-[var(--surface-hover)]",
        destructive ? "text-red-700" : "text-[var(--text)]"
      )}
    >
      {children}
    </a>
  );
}
