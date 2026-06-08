import { ADMIN_TIME_RANGES, type AdminTimeRange } from "@/lib/admin-analytics";

const labels: Record<AdminTimeRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
  all: "All time"
};

export function AdminFilterBar({
  action,
  range,
  children
}: {
  action: string;
  range: AdminTimeRange;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      {children}
      <label>
        <span className="sr-only">Analytics period</span>
        <select name="range" defaultValue={range} className="field select-compact min-w-36 text-sm">
          {ADMIN_TIME_RANGES.map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="button-compact border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold hover:bg-[var(--surface-hover)]">
        Apply
      </button>
    </form>
  );
}
