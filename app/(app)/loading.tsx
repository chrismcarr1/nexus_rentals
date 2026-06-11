export default function AppLoading() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-md border border-[var(--line)] bg-[var(--surface)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-md border border-[var(--line)] bg-white" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-md border border-[var(--line)] bg-white" />
    </div>
  );
}
