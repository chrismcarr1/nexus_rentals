import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed p-8 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="h-14 w-14 rounded-3xl bg-[var(--accent-soft)]" />
        <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </Card>
  );
}
