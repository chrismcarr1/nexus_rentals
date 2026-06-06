import { cn } from "@/lib/utils";

export function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  breadcrumbs?: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-header", className)}>
      <div className="min-w-0 max-w-4xl">
        {breadcrumbs ? <div className="mb-3">{breadcrumbs}</div> : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{eyebrow}</p>
        <h1 className="page-title mt-1.5 font-semibold text-[var(--text)]">{title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-5 text-[var(--muted)]">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
