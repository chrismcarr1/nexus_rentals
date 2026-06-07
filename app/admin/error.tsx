"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Admin page failed", error);
  }, [error]);

  return (
    <div className="border border-red-200 bg-red-50 p-6">
      <p className="text-lg font-semibold text-red-800">Admin data could not be loaded</p>
      <p className="mt-2 text-sm text-red-700">No secrets or partial platform data were exposed. Retry the server-side request.</p>
      <button type="button" onClick={reset} className="mt-4 border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800">
        Retry
      </button>
    </div>
  );
}
