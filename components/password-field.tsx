"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  inputClassName?: string;
};

export function PasswordField({ label, className, inputClassName, id, ...props }: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <label className={cn("block", className)} htmlFor={inputId}>
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <span className="relative block">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          className={cn("w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 pr-12", inputClassName)}
          {...props}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--muted)] transition hover:bg-slate-100 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
          onClick={() => setVisible((current) => !current)}
        >
          <Icon className="h-4 w-4" />
        </button>
      </span>
    </label>
  );
}
