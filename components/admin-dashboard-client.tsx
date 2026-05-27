"use client";

import { useEffect, useState } from "react";
import { Edit3, Save } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type AdminRole = "ADMIN" | "MANAGER" | "TENANT";

type SafeAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  isActive: boolean;
  phone: string | null;
  title: string | null;
  organizationName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type AccountForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: "MANAGER" | "TENANT";
  isActive: boolean;
  phone: string;
  title: string;
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
  formattedAddress: string;
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

type AdminDashboardData = {
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

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function roleTone(role: AdminRole) {
  if (role === "ADMIN") return "danger";
  if (role === "MANAGER") return "warning";
  return "success";
}

function statusTone(status: string) {
  if (status === "ACTIVE" || status === "OCCUPIED") return "success";
  if (status === "ARCHIVED" || status === "VACANT" || status === "UPCOMING") return "warning";
  return "default";
}

function toAccountForm(account: SafeAccount): AccountForm {
  return {
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    role: account.role === "TENANT" ? "TENANT" : "MANAGER",
    isActive: account.isActive,
    phone: account.phone ?? "",
    title: account.title ?? ""
  };
}

export function AdminDashboardClient() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadAdminData() {
      try {
        const response = await fetch("/api/admin/summary", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || "Could not load admin dashboard.");
        }

        if (!ignore) {
          setData(payload as AdminDashboardData);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Could not load admin dashboard.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadAdminData();

    return () => {
      ignore = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="System admin"
          title="Loading app-level account data."
          description="This dashboard is separate from property-management workflows and only available to the approved admin identity."
        />
        <Card className="p-6">
          <p className="text-sm text-[var(--muted)]">Loading admin dashboard...</p>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="System admin"
          title="Admin dashboard unavailable."
          description="The admin API returned an error before exposing any account metadata."
        />
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-800">Could not load admin data</p>
          <p className="mt-2 text-sm text-red-700">{error || "Unknown error"}</p>
        </Card>
      </div>
    );
  }

  const systemRows = [
    ["Organizations", data.system.organizations],
    ["Properties", data.system.properties],
    ["Units", data.system.units],
    ["Leases", data.system.leases],
    ["Payments", data.system.payments],
    ["Expenses", data.system.expenses],
    ["Maintenance requests", data.system.maintenanceRequests],
    ["Open maintenance", data.system.openMaintenanceRequests],
    ["Uploaded files", data.system.uploadedFiles],
    ["Damage assessments", data.system.damageAssessments],
    ["Occupied units", data.system.occupiedUnits],
    ["Vacant units", data.system.vacantUnits]
  ] as const;
  const selectedAccount = selectedAccountId ? data.users.find((user) => user.id === selectedAccountId) ?? null : null;
  const selectedAccountIsAdmin = selectedAccount?.role === "ADMIN";

  function selectAccount(account: SafeAccount) {
    setSelectedAccountId(account.id);
    setAccountForm(toAccountForm(account));
    setAccountError("");
    setAccountMessage("");
  }

  async function saveAccount() {
    if (!selectedAccount || !accountForm) return;

    setIsSavingAccount(true);
    setAccountError("");
    setAccountMessage("");

    try {
      const response = await fetch(`/api/admin/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm)
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Could not update account.");
      }

      const nextData = payload.data as AdminDashboardData;
      setData(nextData);
      const updatedAccount = nextData.users.find((user) => user.id === selectedAccount.id) ?? null;
      setAccountForm(updatedAccount ? toAccountForm(updatedAccount) : null);
      setSelectedAccountId(updatedAccount?.id ?? null);
      setAccountMessage(payload.message || "Account updated.");
    } catch (saveError) {
      setAccountError(saveError instanceof Error ? saveError.message : "Could not update account.");
    } finally {
      setIsSavingAccount(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="System admin"
        title="App-wide owner dashboard."
        description="See who is using Nexus, which organizations and properties exist, and how the whole platform is performing without exposing passwords, tokens, or environment secrets."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total users" value={String(data.summary.totalUsers)} hint="All accounts across organizations." accent="brand" />
        <MetricCard label="Managers" value={String(data.summary.managers)} hint="Accounts with manager access." accent="warning" />
        <MetricCard label="Tenants" value={String(data.summary.tenants)} hint="Resident accounts in the app." accent="success" />
        <MetricCard label="Organizations" value={String(data.summary.organizations)} hint="Workspaces currently stored." />
        <MetricCard label="Properties" value={String(data.summary.properties)} hint="Total managed properties across Nexus." accent="brand" />
        <MetricCard label="Units" value={String(data.summary.units)} hint={`${data.system.occupiedUnits} occupied, ${data.system.vacantUnits} not occupied.`} accent="success" />
        <MetricCard label="Active leases" value={String(data.summary.activeLeases)} hint="Current active lease records." accent="warning" />
        <MetricCard label="Rent roll" value={formatCurrency(data.system.totalMonthlyRent)} hint="Scheduled monthly rent across all units." />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Accounts</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">All user accounts</h2>
            </div>
            <Badge tone="danger">Admin: {data.adminIdentity}</Badge>
          </div>
          <DataTable columns={["Email", "Role", "Status", "Created at", "Updated at", "Organization", "Manage"]} className="mt-5">
            {data.users.map((user) => (
              <tr key={user.id} className="table-row">
                <td className="py-4 pr-4">
                  <p className="font-semibold">{user.email}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {user.firstName} {user.lastName}
                    {user.title ? ` / ${user.title}` : ""}
                  </p>
                </td>
                <td className="py-4 pr-4">
                  <Badge tone={roleTone(user.role)}>{user.role}</Badge>
                </td>
                <td className="py-4 pr-4">
                  <Badge tone={user.isActive ? "success" : "danger"}>{user.isActive ? "ACTIVE" : "DISABLED"}</Badge>
                </td>
                <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(user.createdAt)}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(user.updatedAt)}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{user.organizationName}</td>
                <td className="py-4 pr-4">
                  <button
                    type="button"
                    onClick={() => selectAccount(user)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel)]"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Account editor</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{selectedAccount ? selectedAccount.email : "Select an account"}</h2>
            {!selectedAccount || !accountForm ? (
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Choose Edit from the accounts table to review and update account information.</p>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">First name</span>
                    <input
                      value={accountForm.firstName}
                      onChange={(event) => setAccountForm({ ...accountForm, firstName: event.target.value })}
                      className="field"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Last name</span>
                    <input
                      value={accountForm.lastName}
                      onChange={(event) => setAccountForm({ ...accountForm, lastName: event.target.value })}
                      className="field"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Email</span>
                    <input
                      type="email"
                      value={accountForm.email}
                      disabled={selectedAccountIsAdmin}
                      onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })}
                      className="field disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Role</span>
                    {selectedAccountIsAdmin ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">SYSTEM ADMIN</div>
                    ) : (
                      <select
                        value={accountForm.role}
                        onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value as "MANAGER" | "TENANT" })}
                        className="field"
                      >
                        <option value="MANAGER">Manager</option>
                        <option value="TENANT">Tenant</option>
                      </select>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Phone</span>
                    <input
                      value={accountForm.phone}
                      onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })}
                      className="field"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Title</span>
                    <input
                      value={accountForm.title}
                      onChange={(event) => setAccountForm({ ...accountForm, title: event.target.value })}
                      className="field"
                    />
                  </label>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm">
                  <span>
                    <span className="block font-semibold">Active account</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">Disabled accounts cannot sign in or keep using an active session.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={accountForm.isActive}
                    disabled={selectedAccountIsAdmin}
                    onChange={(event) => setAccountForm({ ...accountForm, isActive: event.target.checked })}
                    className="h-5 w-5"
                  />
                </label>
                <div className="rounded-2xl bg-stone-900/5 px-4 py-3 text-sm text-[var(--muted)]">
                  <p>Organization: {selectedAccount.organizationName}</p>
                  <p>Created: {formatDate(selectedAccount.createdAt)}</p>
                  <p>Updated: {formatDate(selectedAccount.updatedAt)}</p>
                </div>
                {accountError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{accountError}</p> : null}
                {accountMessage ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{accountMessage}</p> : null}
                <button
                  type="button"
                  onClick={() => void saveAccount()}
                  disabled={isSavingAccount}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#184c45] disabled:cursor-wait disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  {isSavingAccount ? "Saving..." : "Save account changes"}
                </button>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Recent signups</p>
            <div className="mt-4 space-y-3">
              {data.recentSignups.map((user) => (
                <div key={user.id} className="panel-muted rounded-[24px] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{user.email}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(user.createdAt)}</p>
                    </div>
                    <Badge tone={roleTone(user.role)}>{user.role}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">System data</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {systemRows.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-stone-900/5 px-4 py-3">
                  <p className="text-xs text-[var(--muted)]">{label}</p>
                  <p className="mt-2 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm text-[var(--muted)]">Last data update: {formatDate(data.system.lastDataUpdate)}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Generated: {formatDate(data.generatedAt)}</p>
          </Card>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Properties</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">All properties in Nexus</h2>
          </div>
          <Badge tone="default">{data.properties.length} properties</Badge>
        </div>
        <DataTable columns={["Property", "Status", "Manager", "Units", "Active leases", "Monthly rent", "Created"]} className="mt-5">
          {data.properties.map((property) => (
            <tr key={property.id} className="table-row">
              <td className="py-4 pr-4">
                <p className="font-semibold">{property.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{property.organizationName} / {property.formattedAddress}</p>
              </td>
              <td className="py-4 pr-4">
                <Badge tone={statusTone(property.status)}>{property.status}</Badge>
              </td>
              <td className="py-4 pr-4">
                <p className="font-medium">{property.managerName ?? "Unassigned"}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{property.managerEmail ?? "No manager email"}</p>
              </td>
              <td className="py-4 pr-4 text-[var(--muted)]">{property.occupiedUnits}/{property.unitCount} occupied</td>
              <td className="py-4 pr-4 text-[var(--muted)]">{property.activeLeases}</td>
              <td className="py-4 pr-4 font-semibold">{formatCurrency(property.monthlyRent)}</td>
              <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(property.createdAt)}</td>
            </tr>
          ))}
        </DataTable>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Organizations</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Workspaces</h2>
          <DataTable columns={["Organization", "Users", "Properties", "Units", "Leases"]} className="mt-5">
            {data.organizations.map((organization) => (
              <tr key={organization.id} className="table-row">
                <td className="py-4 pr-4">
                  <p className="font-semibold">{organization.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{organization.email}</p>
                </td>
                <td className="py-4 pr-4 text-[var(--muted)]">
                  {organization.userCount} total
                  <br />
                  {organization.managerCount} managers / {organization.tenantCount} tenants
                </td>
                <td className="py-4 pr-4 text-[var(--muted)]">{organization.propertyCount}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{organization.unitCount}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{organization.leaseCount}</td>
              </tr>
            ))}
          </DataTable>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Unit inventory</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">All units</h2>
          <DataTable columns={["Unit", "Occupancy", "Lease", "Tenants", "Rent", "Updated"]} className="mt-5">
            {data.units.map((unit) => (
              <tr key={unit.id} className="table-row">
                <td className="py-4 pr-4">
                  <p className="font-semibold">{unit.propertyName}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Unit {unit.unitNumber}</p>
                </td>
                <td className="py-4 pr-4">
                  <Badge tone={statusTone(unit.occupancyStatus)}>{unit.occupancyStatus}</Badge>
                </td>
                <td className="py-4 pr-4 text-[var(--muted)]">{unit.leaseStatus}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{unit.tenantCount}</td>
                <td className="py-4 pr-4 font-semibold">{formatCurrency(unit.monthlyRent)}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(unit.updatedAt)}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
      </div>

      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Recently added properties</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.recentProperties.map((property) => (
            <div key={property.id} className="panel-muted rounded-[24px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{property.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{property.organizationName}</p>
                </div>
                <Badge tone={statusTone(property.status)}>{property.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-[var(--muted)]">Units</p>
                  <p className="mt-1 font-semibold">{property.unitCount}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Leases</p>
                  <p className="mt-1 font-semibold">{property.activeLeases}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Rent</p>
                  <p className="mt-1 font-semibold">{formatCurrency(property.monthlyRent)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
