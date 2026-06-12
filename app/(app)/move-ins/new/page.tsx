import { PageHeader } from "@/components/page-header";
import { NewMoveInWizard, type MoveInPrefill, type MoveInPropertyOption, type MoveInUnitOption } from "@/components/new-move-in-wizard";
import { getSubmissionBundle, managerOwnsApplication, primaryApplicant } from "@/lib/applications";
import { formatAddress } from "@/lib/address";
import { requireRoles } from "@/lib/auth";
import { getUnitAvailableStartDate, leaseBlocksNewMoveIn, leaseCanResumeMoveIn } from "@/lib/lease-connections";
import { readStore } from "@/lib/store";
import { UserRole } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

export default async function NewMoveInPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const store = await readStore();
  const submissionBundle = params.applicationSubmissionId ? getSubmissionBundle(store, params.applicationSubmissionId) : null;
  const sourceApplicant = submissionBundle ? primaryApplicant(submissionBundle.applicants) : null;
  const prefill: MoveInPrefill | undefined =
    submissionBundle &&
    sourceApplicant &&
    submissionBundle.submission.status === "APPROVED" &&
    managerOwnsApplication(store, user, submissionBundle.application)
      ? {
          applicationSubmissionId: submissionBundle.submission.id,
          propertyId: submissionBundle.application.propertyId,
          unitId: submissionBundle.application.unitId,
          tenantFirstName: sourceApplicant.firstName,
          tenantLastName: sourceApplicant.lastName,
          tenantEmail: sourceApplicant.email,
          tenantPhone: sourceApplicant.phone,
          startDate: submissionBundle.application.availableMoveInDate.slice(0, 10),
          moveInDate: submissionBundle.application.availableMoveInDate.slice(0, 10),
          monthlyRent: submissionBundle.application.monthlyRent,
          securityDeposit: submissionBundle.application.securityDeposit
        }
      : undefined;
  const availableUnits = portal.scope.units
    .map((unit) => {
      const unitLeases = portal.scope.leases.filter((lease) => lease.unitId === unit.id);
      const resumableLease = unitLeases
        .filter((lease) => leaseCanResumeMoveIn(lease.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const hasScheduledOccupancy = unitLeases.some((lease) => leaseBlocksNewMoveIn(lease.status));
      const availableStartDate =
        unit.occupancyStatus === "OCCUPIED" && !hasScheduledOccupancy
          ? null
          : getUnitAvailableStartDate(unitLeases, resumableLease?.id);
      return { unit, resumableLease, availableStartDate };
    })
    .filter((item) => Boolean(item.availableStartDate));
  const properties: MoveInPropertyOption[] = portal.scope.properties
    .map((property) => ({
      id: property.id,
      name: property.name,
      formattedAddress: formatAddress(property),
      availableUnitCount: availableUnits.filter((item) => item.unit.propertyId === property.id).length
    }));
  const units: MoveInUnitOption[] = availableUnits
    .filter(({ unit }) => properties.some((property) => property.id === unit.propertyId))
    .map(({ unit, resumableLease, availableStartDate }) => {
      return {
        id: unit.id,
        propertyId: unit.propertyId,
        unitNumber: unit.unitNumber,
        nickname: unit.nickname,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        monthlyRent: unit.monthlyRent,
        depositAmount: unit.depositAmount,
        occupancyStatus: unit.occupancyStatus,
        availableStartDate: availableStartDate!,
        resumableLease: resumableLease
          ? {
              id: resumableLease.id,
              status: resumableLease.status,
              tenantEmail: resumableLease.tenantEmail ?? "",
              startDate: resumableLease.startDate?.slice(0, 10) ?? "",
              endDate: resumableLease.endDate?.slice(0, 10) ?? "",
              monthlyRent: resumableLease.monthlyRent,
              securityDeposit: resumableLease.securityDeposit,
              dueDay: resumableLease.dueDay,
              rentDueTime: resumableLease.rentDueTime,
              documentPath: resumableLease.documentPath,
              managerAbsorbsPaymentCharge: resumableLease.managerAbsorbsPaymentCharge
            }
          : null
      };
    });
  const error =
    params.error && params.error !== "invalid"
      ? params.error
      : params.error === "invalid"
        ? "Review the move-in details and complete all required fields."
        : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manager workflow"
        title="New Move-In"
        description="Guide a new resident from available unit selection through lease, billing, and portal invitation."
      />
      <NewMoveInWizard
        properties={properties}
        units={units}
        initialPropertyId={params.propertyId}
        initialUnitId={params.unitId}
        prefill={prefill}
        error={error}
      />
    </div>
  );
}
