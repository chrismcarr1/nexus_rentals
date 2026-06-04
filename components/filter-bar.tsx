import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FilterOption = {
  name: string;
  label: string;
  value?: string;
  options: Array<{ label: string; value: string }>;
};

export function FilterBar({
  action,
  query,
  queryPlaceholder,
  filters = [],
  hidden = {},
  className
}: {
  action: string;
  query?: string;
  queryPlaceholder?: string;
  filters?: FilterOption[];
  hidden?: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <form action={action} className={cn("filter-bar", className)}>
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null
      )}
      <SearchInput defaultValue={query} placeholder={queryPlaceholder ?? "Search"} className="filter-search" />
      <div className="filter-selects">
        {filters.map((filter) => (
          <label key={filter.name} className="min-w-0">
            <span className="sr-only">{filter.label}</span>
            <select name={filter.name} defaultValue={filter.value ?? ""} className="field select-compact min-w-36 text-sm">
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Button type="submit" variant="secondary" className="button-compact px-3">
        Apply
      </Button>
    </form>
  );
}
