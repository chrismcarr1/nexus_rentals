import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createMaintenanceAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { badgeToneFromMaintenance, badgeToneFromPriority, getPortalContext } from "@/services/portal";

export default async function MaintenancePage() {
  const user = await requireUser();
  const portal = await getPortalContext(user);

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
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{user.role === "TENANT" ? "My requests" : "Maintenance timeline"}</p>
          <div className="mt-5 space-y-3">
            {portal.scope.maintenance.map((item) => {
              const property = portal.scope.properties.find((candidate) => candidate.id === item.propertyId);
              const unit = item.unitId ? portal.scope.units.find((candidate) => candidate.id === item.unitId) : null;

              return (
                <div key={item.id} className="panel-muted rounded-[24px] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-[var(--muted)]">{property?.name}{unit ? ` - ${unit.unitNumber}` : ""} - Requested {formatDate(item.requestedAt)}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                    </div>
                    <div className="text-right">
                      <Badge tone={badgeToneFromMaintenance(item.status)}>{item.status}</Badge>
                      <div className="mt-2">
                        <Badge tone={badgeToneFromPriority(item.priority)}>{item.priority}</Badge>
                      </div>
                      {item.estimatedCost ? <p className="mt-3 text-sm font-semibold">{formatCurrency(item.estimatedCost)}</p> : null}
                    </div>
                  </div>
                  <p className="mt-3 rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">{item.timeline}</p>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">{user.role === "TENANT" ? "Submit request" : "New maintenance request"}</p>
          <form action={createMaintenanceAction} className="mt-6 space-y-4">
            {user.role === "TENANT" ? (
              <>
                <input type="hidden" name="propertyId" value={portal.currentProperty?.id ?? ""} />
                <input type="hidden" name="unitId" value={portal.currentUnit?.id ?? ""} />
              </>
            ) : (
              <>
                <select name="propertyId" className="field">
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
            <input name="title" placeholder="Issue title" className="field" />
            <textarea name="description" placeholder="Description" className="field min-h-24" />
            <div className="grid gap-4 md:grid-cols-2">
              <select name="status" className="field" defaultValue="OPEN">
                {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select name="priority" className="field" defaultValue={user.role === "TENANT" ? "MEDIUM" : "HIGH"}>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            {user.role === "TENANT" ? null : (
              <div className="grid gap-4 md:grid-cols-2">
                <input name="estimatedCost" type="number" step="0.01" placeholder="Estimated cost" className="field" />
                <input name="assignedTo" placeholder="Assigned vendor" className="field" />
              </div>
            )}
            <textarea name="timeline" placeholder="Timeline or next steps" className="field min-h-24" />
            <SubmitButton>{user.role === "TENANT" ? "Submit request" : "Create maintenance item"}</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
