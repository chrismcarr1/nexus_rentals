import Link from "next/link";

import { requestResetAction } from "@/lib/actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass card-shadow w-full max-w-xl rounded-[32px] border border-white/60 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-[var(--brand)]">Password Reset</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl">Request a reset link</h1>
        <p className="mt-3 text-sm text-stone-500">In local demo mode, a token is written to the database and a seeded token is available: `demo-reset-token`.</p>
        {params.success ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Reset token created. For the seeded admin account, you can also use `demo-reset-token` on the reset page.
          </div>
        ) : null}
        <form action={requestResetAction} className="mt-8 space-y-4">
          <input name="email" type="email" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" placeholder="demo@northstar.local" />
          <button type="submit" className="w-full rounded-2xl bg-[var(--brand)] px-4 py-3 font-semibold text-white">
            Create reset token
          </button>
        </form>
        <div className="mt-6 text-sm text-stone-500">
          <Link href="/reset-password" className="font-semibold text-[var(--brand)]">
            Go to reset page
          </Link>
        </div>
      </div>
    </main>
  );
}
