import { cn } from "@/lib/utils";

export function PageHeader({
  breadcrumbs,
  title,
  actions,
  className
}: {
  breadcrumbs?: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-header", className)}>
      <div className="page-header-copy min-w-0 max-w-4xl">
        {breadcrumbs ? <div className="mb-3 breadcrumb">{breadcrumbs}</div> : null}
        <h1 className="page-title font-semibold text-[var(--text)]">{title}</h1>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
