import { resetPasswordAction } from "@/lib/actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass card-shadow w-full max-w-xl rounded-[32px] border border-white/60 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-[var(--brand)]">Reset Password</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl">Set a new password</h1>
        {params.error ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-red-50 px-4 py-3 text-sm text-red-900">Reset token is invalid or expired.</div>
        ) : null}
        <form action={resetPasswordAction} className="mt-8 space-y-4">
          <input name="token" defaultValue={params.token} className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" placeholder="Reset token" />
          <input name="password" type="password" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" placeholder="New password" />
          <button type="submit" className="w-full rounded-2xl bg-[var(--brand)] px-4 py-3 font-semibold text-white">
            Save password
          </button>
        </form>
      </div>
    </main>
  );
}
