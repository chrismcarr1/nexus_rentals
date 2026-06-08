"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const colors = ["#0d8f7b", "#315ccf", "#b7791f", "#7c3aed", "#dc2626", "#0891b2", "#475467", "#16a34a"];

export function AdminAnalyticsChart({
  data,
  series
}: {
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="rgba(102,112,133,0.16)" vertical={false} />
          <XAxis dataKey="label" stroke="#667085" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis stroke="#667085" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              border: "1px solid #dfe3e8",
              borderRadius: 4,
              boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
              color: "#18212f"
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          {series.map((item, index) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
