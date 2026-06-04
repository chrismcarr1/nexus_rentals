import { cn } from "@/lib/utils";

export function DetailSection({
  id,
  title,
  description,
  actions,
  children,
  className
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("surface-panel detail-section", className)}>
      <div className="detail-section-header">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="detail-section-body">{children}</div>
    </section>
  );
}
