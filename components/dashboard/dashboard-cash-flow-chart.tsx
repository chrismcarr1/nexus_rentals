"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type CashFlowChartPoint = {
  label: string;
  collected: number;
  expenses: number;
  net: number;
};

function currencyLabel(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

// Collected income and expenses as bars, net cash flow as a line, over the
// selected dashboard range. All values come from real payments/expenses.
export function DashboardCashFlowChart({ data, showExpenses }: { data: CashFlowChartPoint[]; showExpenses: boolean }) {
  if (!data.length || data.every((point) => point.collected === 0 && point.expenses === 0)) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 text-center text-sm text-[var(--muted)]">
        No payments or expenses recorded in this period yet.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} barSize={14} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(101, 117, 111, 0.16)" vertical={false} />
          <XAxis dataKey="label" stroke="#65756f" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis stroke="#65756f" tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11 }} tickFormatter={currencyLabel} />
          <Tooltip
            formatter={(value: number, name: string) => [currencyLabel(value), name]}
            cursor={{ fill: "rgba(13, 143, 123, 0.06)" }}
            contentStyle={{
              border: "1px solid #dde7e4",
              borderRadius: 8,
              boxShadow: "0 18px 38px rgba(20, 33, 30, 0.12)",
              color: "#14211e",
              fontSize: 12
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#65756f" }} />
          <Bar dataKey="collected" name="Collected" fill="#0d8f7b" radius={[3, 3, 0, 0]} />
          {showExpenses ? <Bar dataKey="expenses" name="Expenses" fill="#315ccf" radius={[3, 3, 0, 0]} /> : null}
          <Line type="monotone" dataKey="net" name="Net cash flow" stroke="#14211e" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
