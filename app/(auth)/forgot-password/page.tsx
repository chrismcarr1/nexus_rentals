import Link from "next/link";

import { requestResetAction } from "@/lib/actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const devResetLink = params.devResetLink;

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass card-shadow w-full max-w-xl rounded-2xl border border-white/60 p-6 sm:p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-[var(--brand)]">Password Reset</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl">Request a reset link</h1>
        <p className="mt-3 text-sm text-stone-500">Enter your account email and we will send a secure password reset link if the account exists.</p>
        {params.error ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-red-50 px-4 py-3 text-sm text-red-900">
            Please enter a valid email address.
          </div>
        ) : null}
        {params.success ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            If that email belongs to an account, a reset link has been sent.
          </div>
        ) : null}
        {devResetLink ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Local development email is not configured.</p>
            <p className="mt-1">Use this development-only reset link while running `npm run dev`.</p>
            <a href={devResetLink} className="mt-3 inline-flex rounded-xl bg-[var(--brand)] px-3 py-2 font-semibold text-white">
              Open reset link
            </a>
          </div>
        ) : null}
        <form action={requestResetAction} className="mt-8 space-y-4">
          <input name="email" type="email" required className="field" placeholder="you@company.com" />
          <button type="submit" className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white">
            Send reset link
          </button>
        </form>
        <div className="mt-6 text-sm text-stone-500">
          <Link href="/login" className="font-semibold text-[var(--brand)]">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
