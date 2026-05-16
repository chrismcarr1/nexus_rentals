import Link from "next/link";

import { loginAction } from "@/lib/actions";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass card-shadow grid w-full max-w-5xl overflow-hidden rounded-[36px] border border-white/60 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="bg-[linear-gradient(155deg,#184c45,#123732)] p-10 text-white">
          <p className="text-sm uppercase tracking-[0.3em] text-white/70">Northstar Rent OS</p>
          <h1 className="mt-6 font-[var(--font-display)] text-5xl leading-tight">Run landlord operations with financial confidence.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/80">
            Secure access, portfolio reporting, tenant and lease management, maintenance workflows, and AI-assisted damage estimation are all live in this local demo.
          </p>
          <div className="mt-8 rounded-[28px] bg-white/10 p-5 text-sm">
            <p className="font-semibold">Demo credentials</p>
            <p className="mt-3">Admin: `demo@northstar.local` / `DemoPass123!`</p>
            <p>Manager: `manager@northstar.local` / `ManagerPass123!`</p>
            <p>Tenant: `tenant@northstar.local` / `TenantPass123!`</p>
          </div>
        </section>
        <section className="p-8 lg:p-10">
          <p className="text-sm uppercase tracking-[0.26em] text-[var(--brand)]">Secure Login</p>
          <h2 className="mt-3 font-[var(--font-display)] text-4xl">Welcome back</h2>
          <p className="mt-3 text-sm text-stone-500">Use a seeded demo account or your own locally created organization account.</p>
          {(params.error || params.reset) && (
            <div className="mt-6 rounded-2xl border border-[var(--line)] bg-stone-900/5 px-4 py-3 text-sm">
              {params.error === "invalid-credentials"
                ? "Invalid email or password."
                : params.error === "server"
                  ? "Login could not reach the hosted database. Check the Vercel environment variables."
                  : "Password reset complete. Sign in with the new password."}
            </div>
          )}
          <form action={loginAction} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Email</span>
              <input name="email" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" placeholder="you@company.com" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Password</span>
              <input name="password" type="password" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" placeholder="Password" />
            </label>
            <button type="submit" className="w-full rounded-2xl bg-[var(--brand)] px-4 py-3 font-semibold text-white">
              Sign in
            </button>
          </form>
          <div className="mt-6 flex items-center justify-between text-sm text-stone-500">
            <Link href="/forgot-password">Forgot password?</Link>
            <Link href="/signup" className="font-semibold text-[var(--brand)]">
              Create account
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
