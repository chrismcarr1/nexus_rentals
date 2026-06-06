"use client";

import type { ChangeEvent, InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";
import { formatPhoneNumber } from "@/lib/phone";

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode">;

export function PhoneInput({ defaultValue, maxLength = 14, onChange, placeholder = "(555) 123-4567", value, ...props }: PhoneInputProps) {
  const formattedValue = value == null ? undefined : formatPhoneNumber(String(value));
  const formattedDefaultValue = defaultValue == null ? undefined : formatPhoneNumber(String(defaultValue));

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = formatPhoneNumber(event.currentTarget.value);
    onChange?.(event);
  }

  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete={props.autoComplete ?? "tel"}
      maxLength={maxLength}
      placeholder={placeholder}
      value={formattedValue}
      defaultValue={formattedDefaultValue}
      onChange={handleChange}
    />
  );
}
