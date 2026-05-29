import { EmptyState } from "@/components/empty-state";
import { MaintenanceResolveForm } from "@/components/maintenance-resolve-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createMaintenanceAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { badgeToneFromMaintenance, badgeToneFromPriority, getPortalContext } from "@/services/portal";

export default async function MaintenancePage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const canCreateMaintenance = user.role === "TENANT" ? Boolean(portal.currentProperty) : portal.scope.properties.length > 0;
  const activeMaintenance = portal.scope.maintenance
    .filter((item) => item.status !== "RESOLVED" && item.status !== "CLOSED")
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const pastMaintenance = portal.scope.maintenance
    .filter((item) => item.status === "RESOLVED" || item.status === "CLOSED")
    .sort((a, b) => String(b.resolvedAt ?? b.updatedAt).localeCompare(String(a.resolvedAt ?? a.updatedAt)));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "TENANT" ? "Maintenance" : "Service operations"}
        title={user.role === "TENANT" ? "Submit and track issues for your unit." : "Open work orders, triage status, and vendor follow-through."}
        description={
          user.role === "TENANT"
            ? "A cleaner resident request flow with request history and current status without exposing internal manager tools."
            : "See active service demand across your scope, prioritize urgent issues, and keep work order information in an operator-ready format."
        }
      />
      <div className="content-split">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{user.role === "TENANT" ? "My active requests" : "Active work orders"}</p>
          <div className="mt-5 space-y-3">
            {activeMaintenance.map((item) => {
              const property = portal.scope.properties.find((candidate) => candidate.id === item.propertyId);
              const unit = item.unitId ? portal.scope.units.find((candidate) => candidate.id === item.unitId) : null;

              return (
                <div key={item.id} className="panel-muted p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-[var(--muted)]">{property?.name}{unit ? ` - ${unit.unitNumber}` : ""} - Requested {formatDate(item.requestedAt)}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <Badge tone={badgeToneFromMaintenance(item.status)}>{item.status}</Badge>
                      <div className="mt-2">
                        <Badge tone={badgeToneFromPriority(item.priority)}>{item.priority}</Badge>
                      </div>
                      {item.estimatedCost ? <p className="mt-3 text-sm font-semibold">{formatCurrency(item.estimatedCost)}</p> : null}
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-line rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">{item.timeline}</p>
                  {user.role !== "TENANT" ? (
                    <MaintenanceResolveForm maintenanceId={item.id} />
                  ) : null}
                </div>
              );
            })}
            {activeMaintenance.length === 0 ? (
              <EmptyState title="No active work orders" description={user.role === "TENANT" ? "You do not have any open maintenance requests right now." : "All scoped maintenance requests are resolved or closed."} />
            ) : null}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">{user.role === "TENANT" ? "Submit request" : "New maintenance request"}</p>
          {params.error === "invalid-maintenance" ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Fill in the required maintenance fields: property, issue title, and a description of at least 4 characters.
            </div>
          ) : null}
          {!canCreateMaintenance ? (
            <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
              {user.role === "TENANT" ? "No active property or unit is attached to this resident account yet." : "Create or assign a property before adding maintenance requests."}
            </div>
          ) : (
            <form action={createMaintenanceAction} className="mt-6 space-y-4">
              {user.role === "TENANT" ? (
                <>
                  <input type="hidden" name="propertyId" value={portal.currentProperty?.id ?? ""} />
                  <input type="hidden" name="unitId" value={portal.currentUnit?.id ?? ""} />
                </>
              ) : (
                <>
                  <select name="propertyId" className="field" required>
                    {portal.scope.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                  </select>
                  <select name="unitId" className="field">
                    <option value="">No specific unit</option>
                    {portal.scope.units.map((unit) => {
                      const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                      return <option key={unit.id} value={unit.id}>{property?.name} {unit.unitNumber}</option>;
                    })}
                  </select>
                </>
              )}
              <input name="title" required minLength={2} placeholder="Issue title" className="field" />
              <textarea name="description" required minLength={4} placeholder="Description" className="field min-h-24" />
              <div className="form-grid-2">
                <select name="status" className="field" defaultValue="OPEN" required>
                  {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select name="priority" className="field" defaultValue={user.role === "TENANT" ? "MEDIUM" : "HIGH"} required>
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              {user.role === "TENANT" ? null : (
                <div className="form-grid-2">
                  <input name="estimatedCost" type="number" min="0" step="0.01" placeholder="Estimated cost" className="field" />
                  <input name="assignedTo" placeholder="Assigned vendor" className="field" />
                </div>
              )}
              <textarea name="timeline" placeholder="Timeline or next steps" className="field min-h-24" />
              <SubmitButton>{user.role === "TENANT" ? "Submit request" : "Create maintenance item"}</SubmitButton>
            </form>
          )}
        </Card>
      </div>
      <Card className="p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Past maintenance orders</p>
            <h2 className="mt-2 text-2xl font-semibold">Resolved request history</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">{pastMaintenance.length} saved</p>
        </div>
        <div className="card-grid-compact mt-5">
          {pastMaintenance.map((item) => {
            const property = portal.scope.properties.find((candidate) => candidate.id === item.propertyId);
            const unit = item.unitId ? portal.scope.units.find((candidate) => candidate.id === item.unitId) : null;

            return (
              <div key={item.id} className="panel-muted p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-[var(--muted)]">{property?.name}{unit ? ` - ${unit.unitNumber}` : ""}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Requested {formatDate(item.requestedAt)}{item.resolvedAt ? ` - Resolved ${formatDate(item.resolvedAt)}` : ""}
                    </p>
                  </div>
                  <Badge tone={badgeToneFromMaintenance(item.status)}>{item.status}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-line rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">{item.timeline}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {item.assignedTo ? <span className="rounded-full bg-white px-3 py-1 text-[var(--muted)]">Vendor: {item.assignedTo}</span> : null}
                  {item.estimatedCost ? <span className="rounded-full bg-white px-3 py-1 text-[var(--muted)]">Estimate: {formatCurrency(item.estimatedCost)}</span> : null}
                  {item.actualCost ? <span className="rounded-full bg-white px-3 py-1 font-semibold text-[var(--text)]">Actual: {formatCurrency(item.actualCost)}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
        {pastMaintenance.length === 0 ? <EmptyState title="No resolved maintenance yet" description="Resolved work orders will be saved here as maintenance history." /> : null}
      </Card>
    </div>
  );
}
