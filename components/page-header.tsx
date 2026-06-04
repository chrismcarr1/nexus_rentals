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
    <section className={cn("surface-panel page-header", className)}>
      <div className="min-w-0 max-w-3xl">
        {breadcrumbs ? <div className="mb-3">{breadcrumbs}</div> : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">{eyebrow}</p>
        <h1 className="page-title mt-2 font-semibold text-[var(--text)]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] lg:text-[15px]">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </section>
  );
}
