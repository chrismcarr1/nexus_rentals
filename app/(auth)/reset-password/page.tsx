import Link from "next/link";

import { PasswordField } from "@/components/password-field";
import { resetPasswordAction } from "@/lib/actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const token = params.token ?? "";

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass card-shadow w-full max-w-xl rounded-[32px] border border-white/60 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-[var(--brand)]">Reset Password</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl">Set a new password</h1>
        {params.error ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-red-50 px-4 py-3 text-sm text-red-900">
            {params.error === "invalid-form" ? "Enter a password of at least 8 characters and make sure both passwords match." : "Reset link is invalid or expired."}
          </div>
        ) : null}
        {token ? (
          <form action={resetPasswordAction} className="mt-8 space-y-4">
            <input name="token" type="hidden" value={token} readOnly />
            <PasswordField name="password" required minLength={8} label="New password" placeholder="New password" />
            <PasswordField name="confirmPassword" required minLength={8} label="Confirm new password" placeholder="Confirm new password" />
            <button type="submit" className="w-full rounded-2xl bg-[var(--brand)] px-4 py-3 font-semibold text-white">
              Save password
            </button>
          </form>
        ) : (
          <div className="mt-8 rounded-2xl border border-[var(--line)] bg-stone-900/5 px-4 py-3 text-sm text-stone-600">
            This page needs a reset link from your email.
          </div>
        )}
        <div className="mt-6 text-sm text-stone-500">
          <Link href="/forgot-password" className="font-semibold text-[var(--brand)]">
            Request a new reset link
          </Link>
        </div>
      </div>
    </main>
  );
}
