import "server-only";

import { getEffectiveUserRole, SYSTEM_ADMIN_EMAIL } from "@/lib/admin";
import { readStore, type AppStore, type UserRole } from "@/lib/store";

type SafeAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  phone: string | null;
  title: string | null;
  organizationName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type SafeOrganization = {
  id: string;
  name: string;
  email: string;
  userCount: number;
  managerCount: number;
  tenantCount: number;
  propertyCount: number;
  unitCount: number;
  leaseCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type SafeProperty = {
  id: string;
  name: string;
  organizationName: string;
  managerName: string | null;
  managerEmail: string | null;
  status: string;
  city: string;
  state: string;
  unitCount: number;
  occupiedUnits: number;
  activeLeases: number;
  monthlyRent: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type SafeUnit = {
  id: string;
  propertyName: string;
  unitNumber: string;
  occupancyStatus: string;
  leaseStatus: string;
  monthlyRent: number;
  tenantCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

function latestDate(values: Array<string | undefined>) {
  return values.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
}

function getStoreLatestUpdate(store: AppStore) {
  return latestDate([
    ...store.organizations.map((item) => item.updatedAt),
    ...store.users.map((item) => item.updatedAt),
    ...store.properties.map((item) => item.updatedAt),
    ...store.units.map((item) => item.updatedAt),
    ...store.tenants.map((item) => item.updatedAt),
    ...store.leases.map((item) => item.updatedAt),
    ...store.payments.map((item) => item.updatedAt),
    ...store.expenses.map((item) => item.updatedAt),
    ...store.maintenanceRequests.map((item) => item.updatedAt),
    ...store.inspections.map((item) => item.updatedAt),
    ...store.damageAssessments.map((item) => item.updatedAt)
  ]);
}

export type AdminDashboardData = {
  generatedAt: string;
  adminIdentity: string;
  summary: {
    totalUsers: number;
    managers: number;
    tenants: number;
    admins: number;
    organizations: number;
    properties: number;
    units: number;
    activeLeases: number;
    recentSignups: number;
  };
  users: SafeAccount[];
  organizations: SafeOrganization[];
  properties: SafeProperty[];
  units: SafeUnit[];
  recentSignups: SafeAccount[];
  recentProperties: SafeProperty[];
  system: {
    organizations: number;
    properties: number;
    units: number;
    leases: number;
    payments: number;
    expenses: number;
    maintenanceRequests: number;
    openMaintenanceRequests: number;
    uploadedFiles: number;
    damageAssessments: number;
    totalMonthlyRent: number;
    occupiedUnits: number;
    vacantUnits: number;
    lastDataUpdate: string | null;
  };
};

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const store = await readStore();
  const organizationNames = new Map(store.organizations.map((organization) => [organization.id, organization.name]));
  const effectiveUsers = store.users.map((user) => ({
    ...user,
    role: getEffectiveUserRole(user.role, user.email)
  }));
  const users = store.users
    .map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: getEffectiveUserRole(user.role, user.email),
      isActive: user.isActive !== false,
      phone: user.phone ?? null,
      title: user.title ?? null,
      organizationName: organizationNames.get(user.organizationId) ?? "Unknown organization",
      createdAt: user.createdAt ?? null,
      updatedAt: user.updatedAt ?? null
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  const recentSignups = [...users].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
  const propertyById = new Map(store.properties.map((property) => [property.id, property]));
  const unitsByProperty = new Map(
    store.properties.map((property) => [property.id, store.units.filter((unit) => unit.propertyId === property.id)])
  );
  const leasesByUnit = new Map(store.units.map((unit) => [unit.id, store.leases.filter((lease) => lease.unitId === unit.id)]));
  const leaseIsActive = (status: string) => status === "ACTIVE" || status === "active";
  const managerById = new Map(effectiveUsers.map((user) => [user.id, user]));
  const organizations = store.organizations
    .map((organization) => {
      const organizationUsers = effectiveUsers.filter((user) => user.organizationId === organization.id);
      const organizationProperties = store.properties.filter((property) => property.organizationId === organization.id);
      const propertyIds = new Set(organizationProperties.map((property) => property.id));
      const organizationUnits = store.units.filter((unit) => propertyIds.has(unit.propertyId));
      const unitIds = new Set(organizationUnits.map((unit) => unit.id));
      const organizationLeases = store.leases.filter(
        (lease) => (lease.propertyId ? propertyIds.has(lease.propertyId) : false) || (lease.unitId ? unitIds.has(lease.unitId) : false)
      );

      return {
        id: organization.id,
        name: organization.name,
        email: organization.email,
        userCount: organizationUsers.length,
        managerCount: organizationUsers.filter((user) => user.role === "MANAGER").length,
        tenantCount: organizationUsers.filter((user) => user.role === "TENANT").length,
        propertyCount: organizationProperties.length,
        unitCount: organizationUnits.length,
        leaseCount: organizationLeases.length,
        createdAt: organization.createdAt ?? null,
        updatedAt: organization.updatedAt ?? null
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const properties = store.properties
    .map((property) => {
      const propertyUnits = unitsByProperty.get(property.id) ?? [];
      const unitIds = new Set(propertyUnits.map((unit) => unit.id));
      const propertyLeases = store.leases.filter(
        (lease) => lease.propertyId === property.id || (lease.unitId ? unitIds.has(lease.unitId) : false)
      );
      const manager = property.managerId ? managerById.get(property.managerId) : null;

      return {
        id: property.id,
        name: property.name,
        organizationName: organizationNames.get(property.organizationId) ?? "Unknown organization",
        managerName: manager ? `${manager.firstName} ${manager.lastName}`.trim() : null,
        managerEmail: manager?.email ?? null,
        status: property.status,
        city: property.city,
        state: property.state,
        unitCount: propertyUnits.length,
        occupiedUnits: propertyUnits.filter((unit) => unit.occupancyStatus === "OCCUPIED").length,
        activeLeases: propertyLeases.filter((lease) => leaseIsActive(lease.status)).length,
        monthlyRent: propertyUnits.reduce((sum, unit) => sum + unit.monthlyRent, 0),
        createdAt: property.createdAt ?? null,
        updatedAt: property.updatedAt ?? null
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const units = store.units
    .map((unit) => {
      const property = propertyById.get(unit.propertyId);
      const leases = leasesByUnit.get(unit.id) ?? [];

      return {
        id: unit.id,
        propertyName: property?.name ?? "Unknown property",
        unitNumber: unit.unitNumber,
        occupancyStatus: unit.occupancyStatus,
        leaseStatus: unit.leaseStatus,
        monthlyRent: unit.monthlyRent,
        tenantCount: new Set(leases.flatMap((lease) => lease.tenantIds)).size,
        createdAt: unit.createdAt ?? null,
        updatedAt: unit.updatedAt ?? null
      };
    })
    .sort((a, b) => `${a.propertyName} ${a.unitNumber}`.localeCompare(`${b.propertyName} ${b.unitNumber}`));
  const recentProperties = [...properties].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
  const occupiedUnits = store.units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;

  return {
    generatedAt: new Date().toISOString(),
    adminIdentity: SYSTEM_ADMIN_EMAIL,
    summary: {
      totalUsers: users.length,
      managers: users.filter((user) => user.role === "MANAGER").length,
      tenants: users.filter((user) => user.role === "TENANT").length,
      admins: users.filter((user) => user.role === "ADMIN").length,
      organizations: organizations.length,
      properties: properties.length,
      units: units.length,
      activeLeases: store.leases.filter((lease) => leaseIsActive(lease.status)).length,
      recentSignups: recentSignups.length
    },
    users,
    organizations,
    properties,
    units,
    recentSignups,
    recentProperties,
    system: {
      organizations: store.organizations.length,
      properties: store.properties.length,
      units: store.units.length,
      leases: store.leases.length,
      payments: store.payments.length,
      expenses: store.expenses.length,
      maintenanceRequests: store.maintenanceRequests.length,
      openMaintenanceRequests: store.maintenanceRequests.filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS").length,
      uploadedFiles: store.uploadedFiles.length,
      damageAssessments: store.damageAssessments.length,
      totalMonthlyRent: store.units.reduce((sum, unit) => sum + unit.monthlyRent, 0),
      occupiedUnits,
      vacantUnits: store.units.length - occupiedUnits,
      lastDataUpdate: getStoreLatestUpdate(store)
    }
  };
}
