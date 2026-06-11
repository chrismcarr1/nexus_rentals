import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6">
      <div className="w-full max-w-md rounded-md border border-[var(--line)] bg-white p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">404</p>
        <p className="mt-2 text-lg font-semibold text-[var(--text)]">Page not found</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          The page you requested does not exist or you no longer have access to it.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--line)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
