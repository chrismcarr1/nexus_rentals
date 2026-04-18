"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CashFlowChart({ data }: { data: Array<{ label: string; rent: number; expenses: number }> }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="rentColor" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#184c45" stopOpacity={0.42} />
              <stop offset="100%" stopColor="#184c45" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseColor" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#b98b39" stopOpacity={0.38} />
              <stop offset="100%" stopColor="#b98b39" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(24, 76, 69, 0.08)" />
          <XAxis dataKey="label" stroke="#786f63" />
          <YAxis stroke="#786f63" />
          <Tooltip />
          <Area type="monotone" dataKey="rent" stroke="#184c45" fill="url(#rentColor)" strokeWidth={2.5} />
          <Area type="monotone" dataKey="expenses" stroke="#b98b39" fill="url(#expenseColor)" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
