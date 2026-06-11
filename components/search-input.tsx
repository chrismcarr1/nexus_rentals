import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

export function SearchInput({
  name = "q",
  defaultValue,
  placeholder = "Search",
  className
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("relative block min-w-0", className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
      <input
        name={name}
        autoComplete="off"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field search-field text-sm"
      />
    </label>
  );
}
