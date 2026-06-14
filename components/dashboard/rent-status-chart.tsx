"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type RentStatusChartSegment = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

const SEGMENT_COLORS: Record<string, string> = {
  paid: "#0d8f7b",
  partial: "#d97706",
  outstanding: "#b7791f",
  overdue: "#dc2626"
};

function currencyLabel(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

// Donut of the period's rent by state (paid / partial / outstanding /
// overdue). The center shows the total tracked for the period.
export function RentStatusChart({ segments, centerLabel }: { segments: RentStatusChartSegment[]; centerLabel: string }) {
  if (!segments.length) {
    return (
      <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 text-center text-sm text-[var(--muted)]">
        No rent charges in this period yet.
      </div>
    );
  }

  return (
    <div className="relative h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            formatter={(value: number, _name, item) => [
              `${currencyLabel(value)} (${(item?.payload as RentStatusChartSegment | undefined)?.count ?? 0} charges)`,
              (item?.payload as RentStatusChartSegment | undefined)?.label ?? ""
            ]}
            contentStyle={{
              border: "1px solid #dde7e4",
              borderRadius: 8,
              boxShadow: "0 18px 38px rgba(20, 33, 30, 0.12)",
              color: "#14211e",
              fontSize: 12
            }}
          />
          <Pie
            data={segments}
            dataKey="amount"
            nameKey="label"
            innerRadius="68%"
            outerRadius="95%"
            paddingAngle={segments.length > 1 ? 2 : 0}
            strokeWidth={0}
          >
            {segments.map((segment) => (
              <Cell key={segment.key} fill={SEGMENT_COLORS[segment.key] ?? "#65756f"} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-lg font-semibold tabular-nums text-[var(--text)]">{centerLabel}</p>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Tracked</p>
      </div>
    </div>
  );
}
