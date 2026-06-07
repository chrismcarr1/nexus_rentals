export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse border-b border-[var(--line)] bg-[var(--surface)]" />
      <div className="ops-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse bg-white" />
        ))}
      </div>
      <div className="h-80 animate-pulse border border-[var(--line)] bg-white" />
    </div>
  );
}
