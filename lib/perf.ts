import "server-only";

// Lightweight server-side timing helper. Wraps an async call and logs how long
// it took, so a single request's load path can be reconstructed from the logs.
// Server-only: never bundled into a client component, so timings never leak.
export async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();

  try {
    return await fn();
  } finally {
    console.log(`[perf] ${label}: ${Math.round(performance.now() - start)}ms`);
  }
}
