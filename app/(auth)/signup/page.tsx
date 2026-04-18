import Link from "next/link";

import { signupAction } from "@/lib/actions";

export default async function SignupPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass card-shadow w-full max-w-3xl rounded-[36px] border border-white/60 p-8 lg:p-10">
        <p className="text-sm uppercase tracking-[0.28em] text-[var(--brand)]">Create Organization</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl">Launch a local landlord workspace</h1>
        <p className="mt-3 text-sm text-stone-500">The first user becomes an admin and owns the organization profile.</p>
        {params.error === "account-exists" ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-stone-900/5 px-4 py-3 text-sm">An account with that email already exists.</div>
        ) : null}
        <form action={signupAction} className="mt-8 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium">Business name</span>
            <input name="businessName" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">First name</span>
            <input name="firstName" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Last name</span>
            <input name="lastName" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email</span>
            <input name="email" type="email" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Password</span>
            <input name="password" type="password" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Phone</span>
            <input name="phone" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Mailing address</span>
            <input name="mailingAddress" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          </label>
          <button type="submit" className="mt-2 rounded-2xl bg-[var(--brand)] px-4 py-3 font-semibold text-white md:col-span-2">
            Create workspace
          </button>
        </form>
        <div className="mt-6 text-sm text-stone-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[var(--brand)]">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
