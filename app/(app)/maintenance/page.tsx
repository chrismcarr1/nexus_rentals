import Link from "next/link";
import {
  CalendarClock,
  ClipboardList,
  FileImage,
  Hash,
  Home,
  KeyRound,
  Plus,
  Phone,
  Send,
  Sparkles
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { MaintenanceAiRequestForm } from "@/components/maintenance-ai-request-form";
import { MaintenanceResolveForm } from "@/components/maintenance-resolve-form";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createMaintenanceAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { formatCurrency, formatDate } from "@/lib/utils";
import { badgeToneFromMaintenance, getPortalContext } from "@/services/portal";

const maintenanceCategories = [
  "Plumbing",
  "Electrical",
  "Heating / cooling",
  "Appliance",
  "Pest control",
  "Doors / windows",
  "Flooring",
  "Common area",
  "Safety",
  "Other"
];

const entryPermissionOptions = [
  { value: "REQUEST_APPROVAL", label: "Ask before entry" },
  { value: "PERMISSION_GRANTED", label: "Permission granted" },
  { value: "EMERGENCY_ONLY", label: "Emergency entry only" }
];

const contactPreferenceOptions = [
  { value: "APP", label: "App message" },
  { value: "PHONE", label: "Phone call" },
  { value: "EMAIL", label: "Email" },
  { value: "TEXT", label: "Text message" }
];

const petOptions = [
  { value: "UNKNOWN", label: "Not specified" },
  { value: "NO", label: "No pets on site" },
  { value: "YES", label: "Pets on site" }
];

function requestCode(id: string) {
  return `MR-${id.replace(/^maint_/, "").slice(0, 8).toUpperCase()}`;
}

function fileNameFromPath(path: string) {
  const cleanPath = path.split("?")[0] ?? path;
  return cleanPath.split(/[\\/]/).filter(Boolean).pop() ?? "Uploaded image";
}

function optionLabel(options: Array<{ value: string; label: string }>, value?: string | null) {
  return options.find((option) => option.value === value)?.label ?? value ?? "Not specified";
}

function DetailCell({ label, value, Icon }: { label: string; value?: string | null; Icon?: ComponentType<{ className?: string }> }) {
  const DetailIcon = Icon;
  return (
    <div className="panel-muted p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        {DetailIcon ? <DetailIcon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <p className="mt-2 min-w-0 break-words text-sm font-medium text-[var(--text)]">{value || "Not specified"}</p>
    </div>
  );
}

function FieldBlock({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
      <span className="mt-2 block">{children}</span>
      {hint ? <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

function FormSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--brand)]">
          {icon}
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

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

  if (user.role !== "TENANT") {
    const query = params.q?.trim().toLowerCase() ?? "";
    const statusFilter = params.status ?? "active";
    const priorityFilter = params.priority ?? "all";
    const selectedWorkOrder = portal.scope.maintenance.find((item) => item.id === params.workOrder) ?? null;
    const filteredMaintenance = portal.scope.maintenance
      .filter((item) => {
        const property = portal.scope.properties.find((candidate) => candidate.id === item.propertyId);
        const unit = item.unitId ? portal.scope.units.find((candidate) => candidate.id === item.unitId) : null;
        const text = `${item.title} ${item.description} ${item.category ?? ""} ${item.assignedTo ?? ""} ${property?.name ?? ""} ${unit?.unitNumber ?? ""}`.toLowerCase();
        if (query && !text.includes(query)) return false;
        if (statusFilter === "active" && (item.status === "RESOLVED" || item.status === "CLOSED")) return false;
        if (statusFilter === "history" && item.status !== "RESOLVED" && item.status !== "CLOSED") return false;
        if (statusFilter !== "all" && statusFilter !== "active" && statusFilter !== "history" && item.status !== statusFilter) return false;
        if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
        return true;
      })
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const urgentCount = activeMaintenance.filter((item) => item.priority === "URGENT" || item.priority === "HIGH").length;
    const inProgressCount = activeMaintenance.filter((item) => item.status === "IN_PROGRESS").length;

    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Operations"
          title="Maintenance"
          description="Triage, assign, and resolve work orders from a scalable operations register."
          actions={
            <div className="flex gap-2">
              <Link href="/maintenance?ai=1" className="inline-flex min-h-9 items-center justify-center gap-2 border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold hover:bg-[var(--surface-hover)]">
                <Sparkles className="h-4 w-4" />
                AI intake
              </Link>
              <Link href="/maintenance?create=1" className="inline-flex min-h-9 items-center justify-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">
                <Plus className="h-4 w-4" />
                New work order
              </Link>
            </div>
          }
        />

        <section className="ops-grid">
          <StatCard label="Active work orders" value={String(activeMaintenance.length)} detail="Open and in progress" tone="brand" />
          <StatCard label="Urgent / high" value={String(urgentCount)} detail="Priority response required" tone={urgentCount ? "danger" : "success"} />
          <StatCard label="In progress" value={String(inProgressCount)} detail="Assigned or underway" tone={inProgressCount ? "warning" : "default"} />
          <StatCard label="Resolved history" value={String(pastMaintenance.length)} detail="Closed operational record" />
        </section>

        <DetailSection title="Work order register" description={`${filteredMaintenance.length} work order${filteredMaintenance.length === 1 ? "" : "s"} match the current view.`}>
          <FilterBar
            action="/maintenance"
            query={params.q}
            queryPlaceholder="Search issue, property, unit, category, or vendor"
            filters={[
              {
                name: "status",
                label: "Status",
                value: statusFilter,
                options: [
                  { label: "Active work orders", value: "active" },
                  { label: "Resolved history", value: "history" },
                  { label: "All statuses", value: "all" },
                  { label: "Open", value: "OPEN" },
                  { label: "In progress", value: "IN_PROGRESS" },
                  { label: "Resolved", value: "RESOLVED" },
                  { label: "Closed", value: "CLOSED" }
                ]
              },
              {
                name: "priority",
                label: "Priority",
                value: priorityFilter,
                options: [
                  { label: "All priorities", value: "all" },
                  { label: "Urgent", value: "URGENT" },
                  { label: "High", value: "HIGH" },
                  { label: "Medium", value: "MEDIUM" },
                  { label: "Low", value: "LOW" }
                ]
              }
            ]}
          />

          {filteredMaintenance.length ? (
            <DataTable className="mt-4" minWidth="66rem" columns={["Work order", "Property / unit", "Category", "Priority", "Status", "Requested", "Vendor", "Estimate", ""]}>
              {filteredMaintenance.map((item) => {
                const property = portal.scope.properties.find((candidate) => candidate.id === item.propertyId);
                const unit = item.unitId ? portal.scope.units.find((candidate) => candidate.id === item.unitId) : null;
                return (
                  <tr key={item.id} className="table-row">
                    <td className="table-cell">
                      <Link href={`/maintenance?workOrder=${encodeURIComponent(item.id)}`} className="table-link font-semibold">
                        {item.title}
                        <span className="mt-0.5 block font-mono text-[11px] font-normal text-[var(--muted)]">{requestCode(item.id)}</span>
                      </Link>
                    </td>
                    <td className="table-cell text-[var(--muted)]">{property?.name ?? "Property"}{unit ? <span className="block text-xs">Unit {unit.unitNumber}</span> : null}</td>
                    <td className="table-cell text-[var(--muted)]">{item.category || "Uncategorized"}</td>
                    <td className="table-cell"><StatusBadge status={item.priority} /></td>
                    <td className="table-cell"><StatusBadge status={item.status} /></td>
                    <td className="table-cell text-[var(--muted)]">{formatDate(item.requestedAt)}</td>
                    <td className="table-cell text-[var(--muted)]">{item.assignedTo || "Unassigned"}</td>
                    <td className="table-cell font-semibold">{item.estimatedCost ? formatCurrency(item.estimatedCost) : "Not set"}</td>
                    <td className="table-cell text-right">
                      <RowActionsMenu>
                        <RowActionLink href={`/maintenance?workOrder=${encodeURIComponent(item.id)}`}>View details</RowActionLink>
                        {property ? <RowActionLink href={`/properties/${property.id}`}>View property</RowActionLink> : null}
                        {unit ? <RowActionLink href={`/units/${unit.id}`}>View unit</RowActionLink> : null}
                      </RowActionsMenu>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <div className="mt-4">
              <EmptyState title="No work orders match" description="Adjust the search or filters, or create a new work order." />
            </div>
          )}
        </DetailSection>

        {params.create === "1" ? (
          <DetailSection id="new-work-order" title="New work order" description="Create and assign an operational maintenance record.">
            {params.error === "invalid-maintenance" ? (
              <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Fill in the required property, title, and issue description.
              </div>
            ) : null}
            <form action={createMaintenanceAction} className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="block text-sm font-semibold">
                  Property
                  <select name="propertyId" className="field mt-2" required>
                    {portal.scope.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Unit
                  <select name="unitId" className="field mt-2">
                    <option value="">No specific unit</option>
                    {portal.scope.units.map((unit) => {
                      const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                      return <option key={unit.id} value={unit.id}>{property?.name} - Unit {unit.unitNumber}</option>;
                    })}
                  </select>
                </label>
                <div className="form-grid-2">
                  <label className="block text-sm font-semibold">
                    Category
                    <select name="category" className="field mt-2" defaultValue="">
                      <option value="">Select category</option>
                      {maintenanceCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    Priority
                    <select name="priority" className="field mt-2" defaultValue="MEDIUM">
                      {["LOW", "MEDIUM", "HIGH", "URGENT"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-semibold">
                  Issue title
                  <input name="title" required minLength={2} className="field mt-2" />
                </label>
                <label className="block text-sm font-semibold">
                  Description
                  <textarea name="description" required minLength={4} className="field mt-2 min-h-28" />
                </label>
              </div>
              <div className="space-y-4">
                <div className="form-grid-2">
                  <label className="block text-sm font-semibold">
                    Status
                    <select name="status" className="field mt-2" defaultValue="OPEN">
                      {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    Issue started
                    <input name="issueStartedAt" type="date" className="field mt-2" />
                  </label>
                </div>
                <label className="block text-sm font-semibold">
                  Assigned vendor or team member
                  <input name="assignedTo" className="field mt-2" />
                </label>
                <div className="form-grid-2">
                  <label className="block text-sm font-semibold">
                    Estimated cost
                    <input name="estimatedCost" type="number" min="0" step="0.01" className="field mt-2" />
                  </label>
                  <label className="block text-sm font-semibold">
                    Actual cost
                    <input name="actualCost" type="number" min="0" step="0.01" className="field mt-2" />
                  </label>
                </div>
                <label className="block text-sm font-semibold">
                  Timeline or next step
                  <textarea name="timeline" className="field mt-2 min-h-28" />
                </label>
                <input type="hidden" name="entryPermission" value="REQUEST_APPROVAL" />
                <input type="hidden" name="contactPreference" value="APP" />
                <input type="hidden" name="petsOnSite" value="UNKNOWN" />
                <div className="flex gap-2">
                  <SubmitButton>Create work order</SubmitButton>
                  <Link href="/maintenance" className="inline-flex min-h-10 items-center justify-center border border-[var(--line-strong)] bg-white px-3.5 py-2 text-sm font-semibold hover:bg-[var(--surface-hover)]">Cancel</Link>
                </div>
              </div>
            </form>
          </DetailSection>
        ) : null}

        {params.ai === "1" ? (
          <DetailSection title="AI photo intake" description="Generate a structured maintenance draft from up to three photos.">
            <MaintenanceAiRequestForm
              userRole={user.role}
              userName={`${user.firstName} ${user.lastName}`.trim()}
              properties={portal.scope.properties.map((property) => ({ id: property.id, name: property.name }))}
              units={portal.scope.units.map((unit) => {
                const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                return { id: unit.id, propertyId: unit.propertyId, unitNumber: unit.unitNumber, propertyName: property?.name ?? "Property" };
              })}
              currentProperty={null}
              currentUnit={null}
            />
          </DetailSection>
        ) : null}

        {selectedWorkOrder ? (
          <aside className="workflow-drawer" aria-label="Work order detail drawer">
            <div className="workflow-drawer-header">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{requestCode(selectedWorkOrder.id)}</p>
                <h2 className="mt-1 truncate text-lg font-semibold">{selectedWorkOrder.title}</h2>
              </div>
              <Link href="/maintenance" className="border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)]">Close</Link>
            </div>
            <div className="workflow-drawer-body">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selectedWorkOrder.priority} />
                <StatusBadge status={selectedWorkOrder.status} />
                {selectedWorkOrder.category ? <StatusBadge status={selectedWorkOrder.category} /> : null}
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-[var(--muted-strong)]">{selectedWorkOrder.description}</p>
              <div className="drawer-grid">
                <div><span>Requested</span><strong>{formatDate(selectedWorkOrder.requestedAt)}</strong></div>
                <div><span>Vendor</span><strong>{selectedWorkOrder.assignedTo || "Unassigned"}</strong></div>
                <div><span>Estimate</span><strong>{selectedWorkOrder.estimatedCost ? formatCurrency(selectedWorkOrder.estimatedCost) : "Not set"}</strong></div>
                <div><span>Actual</span><strong>{selectedWorkOrder.actualCost ? formatCurrency(selectedWorkOrder.actualCost) : "Not set"}</strong></div>
              </div>
              {selectedWorkOrder.timeline ? <DetailSection title="Timeline"><p className="whitespace-pre-line text-sm text-[var(--muted)]">{selectedWorkOrder.timeline}</p></DetailSection> : null}
              {(selectedWorkOrder.imagePaths ?? []).filter((path) => isAllowedStoredAssetPath(path, { allowDemo: true })).length ? (
                <DetailSection title="Attachments">
                  <div className="grid gap-2">
                    {(selectedWorkOrder.imagePaths ?? []).filter((path) => isAllowedStoredAssetPath(path, { allowDemo: true })).map((path) => (
                      <a key={path} href={path} target="_blank" rel="noreferrer" className="flex items-center gap-2 border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-hover)]">
                        <FileImage className="h-4 w-4 text-[var(--brand)]" />
                        <span className="truncate">{fileNameFromPath(path)}</span>
                      </a>
                    ))}
                  </div>
                </DetailSection>
              ) : null}
              <MaintenanceResolveForm maintenanceId={selectedWorkOrder.id} />
            </div>
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-[rgba(13,143,123,0.38)]">
        <div className="border-b border-[rgba(13,143,123,0.22)] bg-[var(--accent-soft)] p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="section-kicker">{user.role === "TENANT" ? "My active requests" : "Active work orders"}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[var(--text)]">Open maintenance queue</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-strong)]">
                Active requests are listed first so urgent issues, access details, and next steps are easy to scan.
              </p>
            </div>
            <div className="rounded-md border border-[rgba(13,143,123,0.24)] bg-white px-4 py-3 text-left sm:text-right">
              <p className="text-3xl font-semibold text-[var(--brand)]">{activeMaintenance.length}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">active</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {activeMaintenance.map((item) => {
              const property = portal.scope.properties.find((candidate) => candidate.id === item.propertyId);
              const unit = item.unitId ? portal.scope.units.find((candidate) => candidate.id === item.unitId) : null;
              const imagePaths = (item.imagePaths ?? []).filter((path) => isAllowedStoredAssetPath(path, { allowDemo: true })).slice(0, 3);

              return (
                <div key={item.id} className="panel-muted p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1 font-mono text-xs font-semibold text-[var(--muted)]">
                          {requestCode(item.id)}
                        </span>
                        <Badge tone={badgeToneFromMaintenance(item.status)}>{item.status}</Badge>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-[var(--text)]">{item.title}</h3>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {property?.name ?? "Property not found"}{unit ? ` - Unit ${unit.unitNumber}` : " - No unit selected"} - Requested {formatDate(item.requestedAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-left lg:text-right">
                      {item.category ? <p className="text-sm font-semibold text-[var(--text)]">{item.category}</p> : null}
                      {item.estimatedCost ? <p className="mt-1 text-sm font-semibold">{formatCurrency(item.estimatedCost)} estimate</p> : null}
                      {item.assignedTo ? <p className="mt-1 text-sm text-[var(--muted)]">Vendor: {item.assignedTo}</p> : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-md border border-[var(--line)] bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Issue description</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--muted-strong)]">{item.description}</p>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <DetailCell label="Started" value={item.issueStartedAt ? formatDate(item.issueStartedAt) : undefined} Icon={CalendarClock} />
                    <DetailCell label="Access" value={optionLabel(entryPermissionOptions, item.entryPermission)} Icon={KeyRound} />
                    <DetailCell label="Contact" value={optionLabel(contactPreferenceOptions, item.contactPreference)} Icon={Phone} />
                    <DetailCell label="Pets" value={optionLabel(petOptions, item.petsOnSite)} Icon={Home} />
                  </div>

                  {item.accessNotes || item.preferredWindow || item.timeline ? (
                    <div className="mt-4 grid gap-3">
                      <DetailCell label="Access notes" value={item.accessNotes} />
                      <DetailCell label="Preferred window" value={item.preferredWindow} />
                      <DetailCell label="Timeline" value={item.timeline} />
                    </div>
                  ) : null}

                  {imagePaths.length ? (
                    <div className="mt-4 rounded-md border border-[var(--line)] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Uploaded images</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {imagePaths.map((path) => (
                        <a
                          key={path}
                          href={path}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                        >
                          <FileImage className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                          <span className="truncate">{fileNameFromPath(path)}</span>
                        </a>
                      ))}
                      </div>
                    </div>
                  ) : null}

                  {user.role !== "TENANT" ? <MaintenanceResolveForm maintenanceId={item.id} /> : null}
                </div>
              );
            })}
            {activeMaintenance.length === 0 ? (
              <EmptyState title="No active work orders" description={user.role === "TENANT" ? "You do not have any open maintenance requests right now." : "All scoped maintenance requests are resolved or closed."} />
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="section-kicker">{user.role === "TENANT" ? "Submit request" : "New maintenance request"}</p>
        <h2 className="mt-2 text-2xl font-semibold">Request intake</h2>
          {params.error === "invalid-maintenance" ? (
            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Fill in the required maintenance fields: property, issue title, and a description of at least 4 characters.
            </div>
          ) : null}
          {!canCreateMaintenance ? (
            <div className="mt-6 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)]">
              {user.role === "TENANT" ? "No active property or unit is attached to this resident account yet." : "Create or assign a property before adding maintenance requests."}
            </div>
          ) : (
            <form action={createMaintenanceAction} className="mt-5 space-y-5">
              <input type="hidden" name="priority" value="MEDIUM" />
              <FormSection title="Request identity" icon={<Hash className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldBlock label="Request ID" hint="The system assigns this after submission.">
                    <input value="Generated on submit" readOnly className="field bg-[var(--surface)] text-[var(--muted)]" />
                  </FieldBlock>
                  <FieldBlock label="Issue category">
                    <select name="category" className="field" defaultValue="">
                      <option value="">Select category</option>
                      {maintenanceCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </FieldBlock>
                </div>
              </FormSection>

              <FormSection title="Property and unit" icon={<Home className="h-4 w-4" />}>
                {user.role === "TENANT" ? (
                  <>
                    <input type="hidden" name="propertyId" value={portal.currentProperty?.id ?? ""} />
                    <input type="hidden" name="unitId" value={portal.currentUnit?.id ?? ""} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailCell label="Property" value={portal.currentProperty?.name} />
                      <DetailCell label="Unit" value={portal.currentUnit?.unitNumber ? `Unit ${portal.currentUnit.unitNumber}` : undefined} />
                    </div>
                  </>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldBlock label="Property">
                      <select name="propertyId" className="field" required>
                        {portal.scope.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                      </select>
                    </FieldBlock>
                    <FieldBlock label="Unit">
                      <select name="unitId" className="field">
                        <option value="">No specific unit</option>
                        {portal.scope.units.map((unit) => {
                          const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                          return <option key={unit.id} value={unit.id}>{property?.name} - Unit {unit.unitNumber}</option>;
                        })}
                      </select>
                    </FieldBlock>
                  </div>
                )}
              </FormSection>

              <FormSection title="Issue details" icon={<ClipboardList className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldBlock label="Issue title">
                    <input name="title" required minLength={2} placeholder="Short summary" className="field" />
                  </FieldBlock>
                  <div className="md:col-span-2">
                    <FieldBlock label="Description">
                      <textarea name="description" required minLength={4} placeholder="Describe what is happening, what changed, and any visible damage." className="field min-h-24" />
                    </FieldBlock>
                  </div>
                  <FieldBlock label="When did it start?">
                    <input name="issueStartedAt" type="date" className="field" />
                  </FieldBlock>
                </div>
              </FormSection>

              <FormSection title="Access and contact" icon={<KeyRound className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldBlock label="Entry permission">
                    <select name="entryPermission" className="field" defaultValue="REQUEST_APPROVAL">
                      {entryPermissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FieldBlock>
                  <FieldBlock label="Preferred service window">
                    <input name="preferredWindow" placeholder="Weekday mornings, after 3 PM, call first" className="field" />
                  </FieldBlock>
                  <FieldBlock label="Contact preference">
                    <select name="contactPreference" className="field" defaultValue="APP">
                      {contactPreferenceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FieldBlock>
                  <FieldBlock label="Contact name">
                    <input name="contactName" placeholder={`${user.firstName} ${user.lastName}`.trim()} className="field" />
                  </FieldBlock>
                  <FieldBlock label="Contact phone">
                    <PhoneInput name="contactPhone" placeholder="Best phone number for access coordination" />
                  </FieldBlock>
                  <FieldBlock label="Access notes">
                    <textarea name="accessNotes" placeholder="Gate code, parking note, doorbell instructions, pet instructions, or anything a vendor should know." className="field min-h-24" />
                  </FieldBlock>
                </div>
              </FormSection>

              <FormSection title="Operations" icon={<ClipboardList className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldBlock label="Pets on site">
                    <select name="petsOnSite" className="field" defaultValue="UNKNOWN">
                      {petOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FieldBlock>
                </div>
                {user.role === "TENANT" ? (
                  <input type="hidden" name="status" value="OPEN" />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldBlock label="Status">
                      <select name="status" className="field" defaultValue="OPEN" required>
                        {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </FieldBlock>
                    <FieldBlock label="Assigned vendor">
                      <input name="assignedTo" placeholder="Vendor, staff member, or trade partner" className="field" />
                    </FieldBlock>
                    <FieldBlock label="Estimated cost">
                      <input name="estimatedCost" type="number" min="0" step="0.01" placeholder="0.00" className="field" />
                    </FieldBlock>
                    <FieldBlock label="Actual cost">
                      <input name="actualCost" type="number" min="0" step="0.01" placeholder="0.00" className="field" />
                    </FieldBlock>
                  </div>
                )}
                <FieldBlock label="Timeline or next step">
                  <textarea name="timeline" placeholder="Awaiting triage, vendor contacted, parts ordered, resident follow-up needed." className="field min-h-24" />
                </FieldBlock>
              </FormSection>

              <SubmitButton className="w-full">
                <Send className="h-4 w-4" />
                {user.role === "TENANT" ? "Submit request" : "Create maintenance request"}
              </SubmitButton>
            </form>
          )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-kicker">AI photo request</p>
            <h2 className="mt-2 text-2xl font-semibold">Generate a request from photos</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Upload up to 3 photos, generate a draft, review the fields, and submit the maintenance request.
            </p>
          </div>
          <Badge tone="warning">Up to 3 photos</Badge>
        </div>
        <MaintenanceAiRequestForm
          userRole={user.role}
          userName={`${user.firstName} ${user.lastName}`.trim()}
          properties={portal.scope.properties.map((property) => ({ id: property.id, name: property.name }))}
          units={portal.scope.units.map((unit) => {
            const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
            return {
              id: unit.id,
              propertyId: unit.propertyId,
              unitNumber: unit.unitNumber,
              propertyName: property?.name ?? "Property"
            };
          })}
          currentProperty={portal.currentProperty ? { id: portal.currentProperty.id, name: portal.currentProperty.name } : null}
          currentUnit={
            portal.currentUnit
              ? {
                  id: portal.currentUnit.id,
                  propertyId: portal.currentUnit.propertyId,
                  unitNumber: portal.currentUnit.unitNumber,
                  propertyName: portal.currentProperty?.name ?? "Property"
                }
              : null
          }
        />
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Past maintenance orders</p>
            <h2 className="mt-2 text-2xl font-semibold">Resolved request history</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">{pastMaintenance.length} saved</p>
        </div>
        <div className="mt-5 space-y-3">
          {pastMaintenance.map((item) => {
            const property = portal.scope.properties.find((candidate) => candidate.id === item.propertyId);
            const unit = item.unitId ? portal.scope.units.find((candidate) => candidate.id === item.unitId) : null;
            const imagePaths = (item.imagePaths ?? []).filter((path) => isAllowedStoredAssetPath(path, { allowDemo: true })).slice(0, 3);

            return (
              <div key={item.id} className="panel-muted p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{requestCode(item.id)}</p>
                    <h3 className="mt-2 font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">{property?.name}{unit ? ` - Unit ${unit.unitNumber}` : ""}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Requested {formatDate(item.requestedAt)}{item.resolvedAt ? ` - Resolved ${formatDate(item.resolvedAt)}` : ""}
                    </p>
                  </div>
                  <Badge tone={badgeToneFromMaintenance(item.status)}>{item.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.category ? <Badge>{item.category}</Badge> : null}
                </div>
                {item.timeline ? (
                  <p className="mt-3 whitespace-pre-line rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">{item.timeline}</p>
                ) : null}
                {imagePaths.length ? (
                  <div className="mt-3 rounded-md border border-[var(--line)] bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Uploaded images</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {imagePaths.map((path) => (
                      <a
                        key={path}
                        href={path}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      >
                        <FileImage className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                        <span className="truncate">{fileNameFromPath(path)}</span>
                      </a>
                    ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {item.assignedTo ? <span className="rounded-md bg-white px-3 py-1 text-[var(--muted)]">Vendor: {item.assignedTo}</span> : null}
                  {item.estimatedCost ? <span className="rounded-md bg-white px-3 py-1 text-[var(--muted)]">Estimate: {formatCurrency(item.estimatedCost)}</span> : null}
                  {item.actualCost ? <span className="rounded-md bg-white px-3 py-1 font-semibold text-[var(--text)]">Actual: {formatCurrency(item.actualCost)}</span> : null}
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
