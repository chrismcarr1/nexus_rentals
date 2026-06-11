import { cn } from "@/lib/utils";
import { DetailPanel } from "@/components/detail-panel";

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
    <DetailPanel id={id} className={cn("detail-section", className)}>
      <div className="detail-section-header">
        <div className="min-w-0 flex-1">
          <h2 className="detail-section-title text-sm font-semibold text-[var(--text)]">{title}</h2>
          {description ? <p className="detail-section-description mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="detail-section-actions shrink-0">{actions}</div> : null}
      </div>
      <div className="detail-section-body">{children}</div>
    </DetailPanel>
  );
}
