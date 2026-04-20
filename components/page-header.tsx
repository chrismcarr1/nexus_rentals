import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-panel flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8", className)}>
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] lg:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] lg:text-[15px]">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </section>
  );
}
