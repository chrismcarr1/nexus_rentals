import { cn } from "@/lib/utils";

export function DataTable({
  columns,
  children,
  className
}: {
  columns: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="pb-4 pr-4">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
