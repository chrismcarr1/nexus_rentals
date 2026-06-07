import { DataTable } from "@/components/data-table";

export function AdminDataTable({
  columns,
  children,
  minWidth,
  className
}: {
  columns: React.ReactNode[];
  children: React.ReactNode;
  minWidth?: string;
  className?: string;
}) {
  return (
    <DataTable columns={columns} minWidth={minWidth} className={className}>
      {children}
    </DataTable>
  );
}
