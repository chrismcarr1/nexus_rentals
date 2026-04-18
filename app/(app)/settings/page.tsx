import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateSettingsAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Organization Settings</p>
        <h1 className="mt-2 text-3xl font-semibold">Account and business profile</h1>
        <form action={updateSettingsAction} className="mt-6 space-y-4">
          <input name="name" defaultValue={user.organization.name} className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="email" defaultValue={user.organization.email} className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <input name="phone" defaultValue={user.organization.phone ?? ""} className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <textarea name="mailingAddress" defaultValue={user.organization.mailingAddress ?? ""} className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <SubmitButton>Update settings</SubmitButton>
        </form>
      </Card>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Profile</p>
        <div className="mt-5 rounded-[28px] bg-[linear-gradient(135deg,#184c45,#2d756b)] p-6 text-white">
          <p className="text-sm uppercase tracking-[0.24em] text-white/70">Signed in as</p>
          <h2 className="mt-3 font-[var(--font-display)] text-4xl">{user.firstName} {user.lastName}</h2>
          <p className="mt-3 text-sm text-white/80">{user.email}</p>
          <p className="mt-1 text-sm text-white/80">{user.role}</p>
        </div>
        <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-white/70 p-5 text-sm leading-7 text-stone-600">
          <p>Password reset flow is available via the public reset pages.</p>
          <p>Role-aware access is enforced on write actions for admin and manager accounts.</p>
          <p>Local uploads are stored under `public/uploads` with a clean abstraction path for future cloud storage migration.</p>
        </div>
      </Card>
    </div>
  );
}
