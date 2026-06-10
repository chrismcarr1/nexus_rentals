"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type RevenueDataPoint = {
  label: string;
  rent: number;
  deposit: number;
};

export function ProjectedRevenueChart({ data }: { data: RevenueDataPoint[] }) {
  if (!data.length || data.every((d) => d.rent === 0 && d.deposit === 0)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] text-sm text-[var(--muted)]">
        No active lease data to project.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={18} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(101, 117, 111, 0.16)" vertical={false} />
          <XAxis dataKey="label" stroke="#65756f" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis stroke="#65756f" tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
            contentStyle={{
              border: "1px solid #dde7e4",
              borderRadius: 8,
              boxShadow: "0 18px 38px rgba(20, 33, 30, 0.12)",
              color: "#14211e",
              fontSize: 12
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#65756f" }} />
          <Bar dataKey="rent" name="Rent" fill="#0d8f7b" radius={[3, 3, 0, 0]} />
          <Bar dataKey="deposit" name="Deposit" fill="#315ccf" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
