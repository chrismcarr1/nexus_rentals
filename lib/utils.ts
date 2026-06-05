import { clsx, type ClassValue } from "clsx";
import { format, isThisMonth, isToday } from "date-fns";
import { twMerge } from "tailwind-merge";

import { formatAppDate } from "@/lib/app-time";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value: string | Date) {
  return formatAppDate(value);
}

export function niceDateLabel(value: Date) {
  if (isToday(value)) return "Today";
  if (isThisMonth(value)) return format(value, "MMM d");
  return format(value, "MMM d");
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function initials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "NA";
}
