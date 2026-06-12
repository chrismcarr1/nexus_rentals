import { labelRowCells, nodeText } from "@/components/data-table-labels";
import { cn } from "@/lib/utils";

export function DataTable({
  columns,
  children,
  className,
  minWidth = "42rem"
}: {
  columns: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}) {
  const labels = columns.map((column) => nodeText(column).trim());

  return (
    <div className={cn("data-table-frame data-table-scroll", className)}>
      <table className="responsive-table text-left text-[13px]" style={{ minWidth }}>
        <thead className="border-b border-[var(--line)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          <tr>
            {columns.map((column, index) => (
              <th key={typeof column === "string" ? column : index} className="table-heading">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{labelRowCells(children, labels)}</tbody>
      </table>
    </div>
  );
}
