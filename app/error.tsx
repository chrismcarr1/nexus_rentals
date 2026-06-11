"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] Page failed to render", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6">
      <div className="w-full max-w-md rounded-md border border-[var(--line)] bg-white p-6 text-center">
        <p className="text-lg font-semibold text-[var(--text)]">Something went wrong</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          The page could not be loaded. Your data is safe — retry, or return to your dashboard.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
          >
            Retry
          </button>
          <a
            href="/dashboard"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--line)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
