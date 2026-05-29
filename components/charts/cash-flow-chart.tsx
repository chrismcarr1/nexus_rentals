"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CashFlowChart({ data }: { data: Array<{ label: string; rent: number; expenses: number }> }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="rentColor" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0d8f7b" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#0d8f7b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseColor" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#315ccf" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#315ccf" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(101, 117, 111, 0.16)" vertical={false} />
          <XAxis dataKey="label" stroke="#65756f" tickLine={false} axisLine={false} />
          <YAxis stroke="#65756f" tickLine={false} axisLine={false} width={42} />
          <Tooltip
            cursor={{ stroke: "rgba(13, 143, 123, 0.2)", strokeWidth: 1 }}
            contentStyle={{
              border: "1px solid #dde7e4",
              borderRadius: 8,
              boxShadow: "0 18px 38px rgba(20, 33, 30, 0.12)",
              color: "#14211e"
            }}
          />
          <Area type="monotone" dataKey="rent" stroke="#0d8f7b" fill="url(#rentColor)" strokeWidth={2.5} />
          <Area type="monotone" dataKey="expenses" stroke="#315ccf" fill="url(#expenseColor)" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
