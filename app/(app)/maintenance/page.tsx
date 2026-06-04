import {
  CalendarClock,
  ClipboardList,
  FileImage,
  Hash,
  Home,
  KeyRound,
  Phone,
  Send
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { MaintenanceAiRequestForm } from "@/components/maintenance-ai-request-form";
import { MaintenanceResolveForm } from "@/components/maintenance-resolve-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
                    <input name="contactPhone" type="tel" placeholder="Best phone number for access coordination" className="field" />
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
