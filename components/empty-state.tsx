import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-content mx-auto flex max-w-md flex-col items-center">
        {Icon ? (
          <div className="empty-state-icon">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <h3 className="empty-state-title text-sm font-semibold text-[var(--text)]">{title}</h3>
        <p className="empty-state-description mt-1.5 text-sm leading-6 text-[var(--muted)]">{description}</p>
        {action ? <div className="empty-state-action mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
