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
        {breadcrumbs ? <div className="mb-3 breadcrumb">{breadcrumbs}</div> : null}
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">{eyebrow}</p>
        <h1 className="page-title mt-1.5 font-semibold text-[var(--text)]">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
