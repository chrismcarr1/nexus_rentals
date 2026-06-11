import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Plus } from "lucide-react";

import { AddressFields } from "@/components/address-fields";
import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PhotoCarousel } from "@/components/photo-carousel";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { MultiUploadInput, SingleUploadInput } from "@/components/upload-inputs";
import { createUnitAction, deletePropertyAction, updatePropertyAction } from "@/lib/actions";
import { formatAddress } from "@/lib/address";
import { managerOwnsApplication, primaryApplicant } from "@/lib/applications";
import { requireRouteAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { readStore } from "@/lib/store";
import { formatCurrency, formatDate, parseTags } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function formatDateOrUnset(value?: string | Date | null) {
  return value ? formatDate(value) : "Not set";
}

function isCurrentLease(status: string) {
  return ["ACTIVE", "UPCOMING", "active", "invited"].includes(status);
}

export default async function PropertyDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ propertyId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const { propertyId } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireRouteAccess("/properties");
  const portal = await getPortalContext(user);
  const store = await readStore();
  const property = await db.property.findFirst({
    where: { id: propertyId, organizationId: user.organizationId },
    include: {
      units: {
        include: {
          leases: true,
          files: true
        }
      },
      expenses: { orderBy: { incurredAt: "desc" }, take: 5 },
      maintenance: { orderBy: { requestedAt: "desc" }, take: 5 },
      files: true
    }
  });

  if (!property || !portal.scope.properties.some((item) => item.id === property.id)) notFound();

  const units = portal.scope.units.filter((unit) => unit.propertyId === property.id);
  const unitIds = units.map((unit) => unit.id);
  const leases = portal.scope.leases.filter((lease) => (lease.propertyId === property.id) || (lease.unitId ? unitIds.includes(lease.unitId) : false));
  const activeLeases = leases.filter((lease) => isCurrentLease(lease.status));
  const payments = portal.scope.payments.filter((payment) => unitIds.includes(payment.unitId));
  const openPayments = payments.filter((payment) => payment.status !== "PAID");
  const maintenance = portal.scope.maintenance.filter((item) => item.propertyId === property.id);
  const openMaintenance = maintenance.filter((item) => item.status !== "RESOLVED" && item.status !== "CLOSED");
  const tenants = Array.from(new Set(leases.flatMap((lease) => lease.tenantIds)))
    .map((tenantId) => portal.scope.tenants.find((tenant) => tenant.id === tenantId))
    .filter(Boolean);
  const applications = store.rentalApplications
    .filter((application) => application.organizationId === user.organizationId && application.propertyId === property.id)
    .filter((application) => user.role === "ADMIN" || managerOwnsApplication(store, user, application))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const applicationSubmissions = store.applicationSubmissions
    .filter((submission) => applications.some((application) => application.id === submission.applicationId))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const imageTimestamp = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
  const propertyImages = [...(property.files ?? [])]
    .filter((file: any) => file.kind === "PROPERTY_IMAGE" && isAllowedStoredAssetPath(file.path, { allowDemo: true }))
    .sort((a: any, b: any) => imageTimestamp(b.createdAt).localeCompare(imageTimestamp(a.createdAt)))
    .slice(0, 20);
  const documents = portal.scope.files
    .filter((file) => {
      if (!isAllowedStoredAssetPath(file.path, { allowDemo: true })) return false;
      if (file.propertyId === property.id) return true;
      if (file.unitId) return unitIds.includes(file.unitId);
      return false;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const occupiedUnits = units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;
  const rentRoll = units.reduce((sum, unit) => sum + unit.monthlyRent, 0);
  const overdue = openPayments.reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
  const activity = [
    ...payments.map((payment) => ({ id: payment.id, label: payment.description, detail: `${payment.status} payment`, date: payment.updatedAt ?? payment.dueDate, kind: "Payment" })),
    ...maintenance.map((item) => ({ id: item.id, label: item.title, detail: `${item.priority} ${item.status.toLowerCase()} work order`, date: item.updatedAt, kind: "Maintenance" })),
    ...documents.map((file) => ({ id: file.id, label: file.label || file.kind, detail: file.path, date: file.createdAt, kind: "File" }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={
          <Link href="/properties" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)]">
            <ArrowLeft className="h-4 w-4" />
            Properties
          </Link>
        }
        eyebrow="Property detail"
        title={property.name}
        description={formatAddress(property)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="#edit" className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]">
              Edit property
            </Link>
            <Link href="#add-unit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
              <Plus className="h-4 w-4" />
              New Unit
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="surface-panel overflow-hidden">
          {propertyImages.length ? (
            <PhotoCarousel photos={propertyImages} />
          ) : (
            <div className="flex h-72 items-center justify-center bg-[var(--surface)] text-[var(--muted)]">
              <Building2 className="h-10 w-10" />
            </div>
          )}
        </div>

        <DetailSection title="Property summary" description={property.description || "No property description has been added."}>
          <section className="ops-grid">
            <StatCard label="Units" value={String(units.length)} detail={`${occupiedUnits} occupied`} tone="brand" />
            <StatCard label="Occupancy" value={`${Math.round((occupiedUnits / Math.max(units.length, 1)) * 100)}%`} detail={`${units.length - occupiedUnits} vacant`} tone="success" />
            <StatCard label="Rent roll" value={formatCurrency(rentRoll)} detail="Scheduled monthly rent" tone="brand" />
            <StatCard label="Overdue" value={formatCurrency(overdue)} detail={`${openPayments.length} open charges`} tone={overdue ? "danger" : "success"} />
            <StatCard label="Open maintenance" value={String(openMaintenance.length)} detail={`${maintenance.length} total records`} tone={openMaintenance.length ? "warning" : "success"} />
            <StatCard label="Active leases" value={String(activeLeases.length)} detail={`${tenants.length} tenants`} />
          </section>
          {parseTags(property.amenities).length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {parseTags(property.amenities).map((tag) => <StatusBadge key={tag} status={tag} tone="default" />)}
            </div>
          ) : null}
        </DetailSection>
      </section>

      <DetailSection title="Units" description="Inventory, occupancy, rent, balances, and unit actions.">
        {units.length ? (
          <DataTable columns={["Unit", "Type", "Rent", "Balance", "Lease", "Occupancy", ""]} minWidth="52rem">
            {units.map((unit) => {
              const lease = leases.find((item) => item.unitId === unit.id && isCurrentLease(item.status));
              const balance = payments.filter((payment) => payment.unitId === unit.id && payment.status !== "PAID").reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
              return (
                <tr key={unit.id} className="table-row">
                  <td className="table-cell"><Link href={`/units/${unit.id}`} className="table-link font-semibold">Unit {unit.unitNumber}</Link></td>
                  <td className="table-cell text-[var(--muted)]">{unit.nickname || unit.unitType}</td>
                  <td className="table-cell font-semibold">{formatCurrency(unit.monthlyRent)}</td>
                  <td className="table-cell font-semibold">{formatCurrency(balance)}</td>
                  <td className="table-cell"><StatusBadge status={lease?.status ?? unit.leaseStatus} /></td>
                  <td className="table-cell"><StatusBadge status={unit.occupancyStatus} /></td>
                  <td className="table-cell text-right">
                    <RowActionsMenu>
                      <RowActionLink href={`/units/${unit.id}`}>View</RowActionLink>
                      <RowActionLink href={`/leases?unitId=${unit.id}`}>Add lease</RowActionLink>
                      <RowActionLink href={`/move-ins/new?propertyId=${property.id}&unitId=${unit.id}`}>Start move-in</RowActionLink>
                      <RowActionLink href={`/transactions?create=1&unitId=${unit.id}`}>Record payment</RowActionLink>
                    </RowActionsMenu>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No units yet" description="Add units to begin tracking occupancy, leases, rent roll, and maintenance." />
        )}
      </DetailSection>

      <section className="ops-split">
        <DetailSection title="Active leases" description="Current and upcoming lease records tied to this property.">
          {activeLeases.length ? (
            <DataTable columns={["Lease", "Unit", "Tenant", "Term", "Rent", "Status"]} minWidth="50rem">
              {activeLeases.map((lease) => {
                const unit = lease.unitId ? units.find((item) => item.id === lease.unitId) : null;
                const leaseTenants = lease.tenantIds.map((tenantId) => portal.scope.tenants.find((tenant) => tenant.id === tenantId)).filter(Boolean);
                return (
                  <tr key={lease.id} className="table-row">
                    <td className="table-cell font-semibold">{lease.nexusLeaseId ?? lease.id}</td>
                    <td className="table-cell text-[var(--muted)]">{unit ? `Unit ${unit.unitNumber}` : "Unassigned"}</td>
                    <td className="table-cell text-[var(--muted)]">{leaseTenants.length ? leaseTenants.map((tenant) => `${tenant?.firstName} ${tenant?.lastName}`).join(", ") : lease.tenantEmail ?? "No tenant"}</td>
                    <td className="table-cell text-[var(--muted)]">{formatDateOrUnset(lease.startDate)} to {formatDateOrUnset(lease.endDate)}</td>
                    <td className="table-cell font-semibold">{formatCurrency(lease.monthlyRent)}</td>
                    <td className="table-cell"><StatusBadge status={lease.status} /></td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <EmptyState title="No active leases" description="Lease records will appear once tenants are connected or move-ins are started." />
          )}
        </DetailSection>

        <DetailSection title="Tenants" description="Residents connected through current or historical leases.">
          {tenants.length ? (
            <div>
              {tenants.map((tenant) => (
                <div key={tenant!.id} className="activity-item">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{tenant!.firstName} {tenant!.lastName}</p>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">{tenant!.email || "No email"} {tenant!.phone ? `- ${tenant!.phone}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No tenants connected" description="Tenants will appear after lease creation or move-in." />
          )}
        </DetailSection>
      </section>

      <section className="ops-split">
        <DetailSection title="Applications" description="Application links and submissions for this property.">
          {applications.length ? (
            <DataTable columns={["Application", "Applicant", "Submitted", "Status", "Fee"]} minWidth="46rem">
              {applications.map((application) => {
                const submission = applicationSubmissions.find((item) => item.applicationId === application.id);
                const applicants = submission ? store.applicationApplicants.filter((applicant) => applicant.submissionId === submission.id) : [];
                const applicant = primaryApplicant(applicants);
                return (
                  <tr key={application.id} className="table-row">
                    <td className="table-cell"><Link href={`/applications/${application.id}`} className="table-link font-semibold">{application.title}</Link></td>
                    <td className="table-cell text-[var(--muted)]">{applicant ? `${applicant.firstName} ${applicant.lastName}` : "No submissions"}</td>
                    <td className="table-cell text-[var(--muted)]">{submission ? formatDate(submission.submittedAt) : "Not submitted"}</td>
                    <td className="table-cell"><StatusBadge status={submission?.status ?? application.status} /></td>
                    <td className="table-cell"><StatusBadge status={submission?.feeStatus ?? (application.applicationFee ? "UNPAID" : "NOT_REQUIRED")} /></td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <EmptyState title="No applications" description="Create application links for available units from the Applications section." />
          )}
        </DetailSection>

        <DetailSection title="Activity log" description="Recent payments, maintenance updates, and document uploads.">
          {activity.length ? (
            <div>
              {activity.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="activity-item">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.label}</p>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">{item.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{item.kind}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No activity yet" description="Operational events for this property will appear here." />
          )}
        </DetailSection>
      </section>

      <section className="ops-split">
        <DetailSection title="Payments and rent roll" description="Recent ledger entries for units in this property.">
          {payments.length ? (
            <DataTable columns={["Description", "Unit", "Due", "Status", "Amount"]} minWidth="44rem">
              {payments.slice(0, 12).map((payment) => {
                const unit = units.find((item) => item.id === payment.unitId);
                return (
                  <tr key={payment.id} className="table-row">
                    <td className="table-cell font-semibold">{payment.description}</td>
                    <td className="table-cell text-[var(--muted)]">{unit ? `Unit ${unit.unitNumber}` : "Unit unavailable"}</td>
                    <td className="table-cell text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                    <td className="table-cell"><StatusBadge status={payment.status} /></td>
                    <td className="table-cell font-semibold">{formatCurrency(payment.balanceDue || payment.amount)}</td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <EmptyState title="No payments yet" description="Rent charges and payments will appear here." />
          )}
        </DetailSection>

        <DetailSection title="Maintenance" description="Open and recent maintenance requests for this property.">
          {maintenance.length ? (
            <div>
              {maintenance.slice(0, 8).map((item) => {
                const unit = item.unitId ? units.find((candidate) => candidate.id === item.unitId) : null;
                return (
                  <div key={item.id} className="activity-item">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">{unit ? `Unit ${unit.unitNumber}` : "Property level"} - requested {formatDate(item.requestedAt)}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No maintenance" description="Work orders will appear when requests are submitted." />
          )}
        </DetailSection>
      </section>

      <DetailSection title="Documents" description="Property and unit files attached to this asset.">
        {documents.length ? (
          <DataTable columns={["File", "Kind", "Attachment", "Created", ""]} minWidth="50rem">
            {documents.slice(0, 12).map((file) => {
              const unit = file.unitId ? units.find((item) => item.id === file.unitId) : null;
              return (
                <tr key={file.id} className="table-row">
                  <td className="table-cell font-semibold">{file.label || file.kind}</td>
                  <td className="table-cell"><StatusBadge status={file.kind} /></td>
                  <td className="table-cell text-[var(--muted)]">{unit ? `Unit ${unit.unitNumber}` : property.name}</td>
                  <td className="table-cell text-[var(--muted)]">{formatDate(file.createdAt)}</td>
                  <td className="table-cell text-right">
                    <RowActionsMenu>
                      <RowActionLink href={file.path}>Open file</RowActionLink>
                      {unit ? <RowActionLink href={`/units/${unit.id}`}>View unit</RowActionLink> : null}
                    </RowActionsMenu>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No documents" description="Uploaded property and unit files will appear here." />
        )}
      </DetailSection>

      <section className="ops-split">
        <DetailSection id="edit" title="Edit property" description="Update details, address, amenities, internal notes, manager, and photos.">
          {query.error ? (
            <div className="page-alert page-alert-warning mb-4">
              {query.error === "invalid-address"
                ? "Enter a complete property address with street, city, state, ZIP or postal code, and country."
                : "Review the property details and try again."}
            </div>
          ) : null}
          <form action={updatePropertyAction} className="space-y-4">
            <input type="hidden" name="propertyId" value={property.id} />
            <input name="name" defaultValue={property.name} placeholder="Property name" className="field" />
            <AddressFields defaultValue={property} />
            <textarea name="description" defaultValue={property.description ?? ""} placeholder="Asset summary" className="field min-h-24" />
            <input name="amenities" defaultValue={property.amenities} placeholder="Amenities, comma separated" className="field" />
            <textarea name="notes" defaultValue={property.notes ?? ""} placeholder="Internal notes" className="field min-h-24" />
            {user.role === "ADMIN" ? (
              <select name="managerId" defaultValue={property.managerId ?? ""} className="field">
                <option value="">Unassigned manager</option>
                {portal.managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.firstName} {manager.lastName}
                  </option>
                ))}
              </select>
            ) : null}
            <MultiUploadInput name="imagePaths" label="Add property photos — up to 20 total" accept="image/*" />
            <SubmitButton>Save changes</SubmitButton>
          </form>
        </DetailSection>

        <div className="space-y-4">
          <DetailSection id="add-unit" title="Add unit" description="Create a unit under this property.">
            {query.error === "duplicate-unit" ? (
              <div className="page-alert page-alert-warning mb-4">
                A unit with that number already exists in this property. Use a different unit number.
              </div>
            ) : query.error === "invalid-unit" ? (
              <div className="page-alert page-alert-warning mb-4">
                Review the unit details. Unit number, type, bedrooms, bathrooms, rent, and deposit are required.
              </div>
            ) : null}
            <form action={createUnitAction} className="space-y-4">
              <input type="hidden" name="propertyId" value={property.id} />
              <div className="form-grid-2">
                <input name="unitNumber" placeholder="Unit number" className="field" />
                <input name="nickname" placeholder="Nickname" className="field" />
              </div>
              <input name="unitType" placeholder="Unit type" className="field" />
              <div className="form-grid-3">
                <input name="bedrooms" type="number" step="1" placeholder="Bedrooms" className="field" />
                <input name="bathrooms" type="number" step="0.5" placeholder="Bathrooms" className="field" />
                <input name="squareFeet" type="number" step="1" placeholder="Sq ft" className="field" />
              </div>
              <div className="form-grid-2">
                <input name="monthlyRent" type="number" step="0.01" placeholder="Monthly rent" className="field" />
                <input name="depositAmount" type="number" step="0.01" placeholder="Deposit" className="field" />
              </div>
              <div className="form-grid-2">
                <select name="occupancyStatus" className="field">
                  <option value="VACANT">Vacant</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="NOTICE">Notice</option>
                  <option value="TURNOVER">Turnover</option>
                </select>
                <select name="leaseStatus" className="field">
                  <option value="UPCOMING">Upcoming</option>
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="TERMINATED">Terminated</option>
                </select>
              </div>
              <textarea name="amenities" placeholder="Amenities, comma separated" className="field min-h-24" />
              <SingleUploadInput name="imagePath" label="Upload unit image" />
              <SubmitButton>Create unit</SubmitButton>
            </form>
          </DetailSection>

          <DetailSection title="Delete property" description="This permanently removes the property and related operating records.">
            <form action={deletePropertyAction} className="space-y-4">
              <input type="hidden" name="propertyId" value={property.id} />
              <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
                <input type="checkbox" name="confirmDelete" value="yes" required className="mt-1" />
                <span>I understand this cannot be undone.</span>
              </label>
              <SubmitButton variant="danger" pendingLabel="Deleting...">Delete property</SubmitButton>
            </form>
          </DetailSection>
        </div>
      </section>
    </div>
  );
}
