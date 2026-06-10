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
      <div className="mx-auto flex max-w-md flex-col items-center">
        {Icon ? (
          <div className="empty-state-icon">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
