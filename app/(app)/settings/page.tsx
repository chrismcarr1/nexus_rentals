import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateProfileAction, updateSettingsAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getPortalContext } from "@/services/portal";

export default async function SettingsPage() {
  const user = await requireUser();
  const portal = await getPortalContext(user);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "Settings and controls" : user.role === "MANAGER" ? "Profile and workspace" : "Profile and preferences"}
        title={
          user.role === "ADMIN"
            ? "Platform settings, team visibility, and permissions context."
            : user.role === "MANAGER"
              ? "Your profile, assigned scope, and operational reference materials."
              : "Resident account details and communication preferences."
        }
        description={
          user.role === "ADMIN"
            ? "Admins retain global settings and team-level visibility. Managers and tenants get intentionally narrower settings experiences."
            : user.role === "MANAGER"
              ? "Keep your contact details current while staying grounded in the portfolio scope you actively manage."
              : "Update your basic profile details and review the documents and notices most relevant to your tenancy."
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {user.role === "ADMIN" ? (
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Organization settings</p>
            <h1 className="mt-2 text-3xl font-semibold">Account and business profile</h1>
            <form action={updateSettingsAction} className="mt-6 space-y-4">
              <input name="name" defaultValue={user.organization.name} className="field" />
              <input name="email" defaultValue={user.organization.email} className="field" />
              <input name="phone" defaultValue={user.organization.phone ?? ""} className="field" />
              <textarea name="mailingAddress" defaultValue={user.organization.mailingAddress ?? ""} className="field min-h-24" />
              <SubmitButton>Update settings</SubmitButton>
            </form>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">My profile</p>
            <h1 className="mt-2 text-3xl font-semibold">Basic account details</h1>
            <form action={updateProfileAction} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input name="firstName" defaultValue={user.firstName} className="field" />
                <input name="lastName" defaultValue={user.lastName} className="field" />
              </div>
              <input name="phone" defaultValue={user.phone ?? ""} className="field" />
              <input name="title" defaultValue={user.title ?? ""} className="field" />
              <SubmitButton>Save profile</SubmitButton>
            </form>
          </Card>
        )}
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Profile</p>
          <div className="mt-5 rounded-[28px] bg-[linear-gradient(135deg,#102842,#1f6b5f)] p-6 text-white">
            <p className="text-sm uppercase tracking-[0.24em] text-white/70">Signed in as</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">{user.firstName} {user.lastName}</h2>
            <p className="mt-3 text-sm text-white/80">{user.email}</p>
            <p className="mt-1 text-sm text-white/80">{user.role}</p>
          </div>
          <div className="mt-5 space-y-3">
            {user.role === "ADMIN" ? (
              portal.managers.map((manager) => (
                <div key={manager.id} className="panel-muted rounded-[24px] p-4">
                  <p className="font-semibold">{manager.firstName} {manager.lastName}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{manager.title || "Property Manager"}</p>
                </div>
              ))
            ) : user.role === "MANAGER" ? (
              portal.scope.properties.map((property) => (
                <div key={property.id} className="panel-muted rounded-[24px] p-4">
                  <p className="font-semibold">{property.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{property.city}, {property.state}</p>
                </div>
              ))
            ) : (
              portal.documents.map((file) => (
                <div key={file.id} className="panel-muted rounded-[24px] p-4">
                  <p className="font-semibold">{file.label || file.kind}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{file.path}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
