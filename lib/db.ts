import { getEffectiveUserRole } from "@/lib/admin";
import { readStore, updateStore, createId, nowIso, type AppStore, type DamageAssessment, type Inspection, type UploadedFile } from "@/lib/store";

function toDateFields<T extends Record<string, any>>(item: T, keys: string[]) {
  const copy = { ...item } as Record<string, any>;
  for (const key of keys) {
    if (copy[key]) copy[key] = new Date(copy[key]);
  }
  return copy as T;
}

function sortItems<T>(items: T[], orderBy?: Record<string, "asc" | "desc">) {
  if (!orderBy) return items;
  const [field, direction] = Object.entries(orderBy)[0];
  return [...items].sort((a: any, b: any) =>
    direction === "asc" ? String(a[field]).localeCompare(String(b[field])) : String(b[field]).localeCompare(String(a[field]))
  );
}

function takeItems<T>(items: T[], take?: number) {
  return typeof take === "number" ? items.slice(0, take) : items;
}

function withEffectiveUserRole<T extends { role: any; email: string }>(user: T) {
  return { ...user, role: getEffectiveUserRole(user.role ?? "MANAGER", user.email) };
}

function findPropertyForUnit(store: AppStore, unitId?: string) {
  if (!unitId) return undefined;
  const unit = store.units.find((item) => item.id === unitId);
  return store.properties.find((item) => item.id === unit?.propertyId);
}

function findPropertyForLease(store: AppStore, lease: any) {
  if (lease.propertyId) return store.properties.find((item) => item.id === lease.propertyId);
  return findPropertyForUnit(store, lease.unitId);
}

function hydrateProperty(store: AppStore, property: any) {
  return {
    ...toDateFields(property, ["createdAt", "updatedAt"]),
    units: store.units.filter((item) => item.propertyId === property.id).map((unit) => hydrateUnit(store, unit)),
    expenses: store.expenses.filter((item) => item.propertyId === property.id).map((item) => toDateFields(item, ["incurredAt", "createdAt", "updatedAt"])),
    maintenance: store.maintenanceRequests.filter((item) => item.propertyId === property.id).map((item) => toDateFields(item, ["requestedAt", "resolvedAt", "createdAt", "updatedAt"])),
    files: store.uploadedFiles.filter((item) => item.propertyId === property.id).map((item) => toDateFields(item, ["createdAt"]))
  };
}

function hydrateUnit(store: AppStore, unit: any) {
  const property = store.properties.find((item) => item.id === unit.propertyId)!;
  return {
    ...toDateFields(unit, ["createdAt", "updatedAt"]),
    property: toDateFields(property, ["createdAt", "updatedAt"]),
    leases: store.leases.filter((item) => item.unitId === unit.id).map((lease) => hydrateLease(store, lease)),
    payments: store.payments.filter((item) => item.unitId === unit.id).map((payment) => hydratePayment(store, payment)),
    expenses: store.expenses.filter((item) => item.unitId === unit.id).map((expense) => hydrateExpense(store, expense)),
    maintenance: store.maintenanceRequests.filter((item) => item.unitId === unit.id).map((request) => hydrateMaintenance(store, request)),
    inspections: store.inspections.filter((item) => item.unitId === unit.id).map((inspection) => hydrateInspection(store, inspection)),
    files: store.uploadedFiles.filter((item) => item.unitId === unit.id).map((file) => toDateFields(file, ["createdAt"]))
  };
}

function hydrateLease(store: AppStore, lease: any) {
  const unit = lease.unitId ? store.units.find((item) => item.id === lease.unitId) : null;
  const property = findPropertyForLease(store, lease);
  return {
    ...toDateFields(lease, ["startDate", "endDate", "createdAt", "updatedAt"]),
    unit: unit ? hydrateUnitBare(store, unit) : null,
    property: property ? toDateFields(property, ["createdAt", "updatedAt"]) : null,
    tenants: (lease.tenantIds ?? [])
      .map((tenantId: string) => store.tenants.find((item) => item.id === tenantId))
      .filter(Boolean)
      .map((tenant) => ({ tenant: toDateFields(tenant!, ["createdAt", "updatedAt"]) }))
  };
}

function hydrateUnitBare(store: AppStore, unit: any) {
  const property = store.properties.find((item) => item.id === unit.propertyId)!;
  return {
    ...toDateFields(unit, ["createdAt", "updatedAt"]),
    property: toDateFields(property, ["createdAt", "updatedAt"])
  };
}

function hydratePayment(store: AppStore, payment: any) {
  const unit = store.units.find((item) => item.id === payment.unitId)!;
  return {
    ...toDateFields(payment, ["dueDate", "paidDate", "createdAt", "updatedAt"]),
    unit: hydrateUnitBare(store, unit),
    lease: payment.leaseId ? hydrateLease(store, store.leases.find((item) => item.id === payment.leaseId)!) : null
  };
}

function hydrateExpense(store: AppStore, expense: any) {
  return {
    ...toDateFields(expense, ["incurredAt", "createdAt", "updatedAt"]),
    property: toDateFields(store.properties.find((item) => item.id === expense.propertyId)!, ["createdAt", "updatedAt"]),
    unit: expense.unitId ? toDateFields(store.units.find((item) => item.id === expense.unitId)!, ["createdAt", "updatedAt"]) : null
  };
}

function hydrateMaintenance(store: AppStore, item: any) {
  return {
    ...toDateFields(item, ["requestedAt", "resolvedAt", "createdAt", "updatedAt"]),
    property: toDateFields(store.properties.find((candidate) => candidate.id === item.propertyId)!, ["createdAt", "updatedAt"]),
    unit: item.unitId ? toDateFields(store.units.find((candidate) => candidate.id === item.unitId)!, ["createdAt", "updatedAt"]) : null
  };
}

function hydrateInspection(store: AppStore, inspection: Inspection) {
  return {
    ...toDateFields(inspection, ["inspectionDate", "createdAt", "updatedAt"]),
    unit: hydrateUnitBare(store, store.units.find((item) => item.id === inspection.unitId)!),
    lease: inspection.leaseId ? hydrateLease(store, store.leases.find((item) => item.id === inspection.leaseId)!) : null,
    assessments: store.damageAssessments.filter((item) => item.inspectionId === inspection.id).map((item) => hydrateAssessment(store, item)),
    files: store.uploadedFiles.filter((item) => item.inspectionId === inspection.id).map((item) => toDateFields(item, ["createdAt"]))
  };
}

function hydrateAssessment(store: AppStore, assessment: DamageAssessment) {
  return {
    ...toDateFields(assessment, ["createdAt", "updatedAt"]),
    inspection: hydrateInspectionBare(store, store.inspections.find((item) => item.id === assessment.inspectionId)!),
    files: store.uploadedFiles.filter((item) => item.assessmentId === assessment.id).map((item) => toDateFields(item, ["createdAt"]))
  };
}

function hydrateInspectionBare(store: AppStore, inspection: Inspection) {
  return {
    ...toDateFields(inspection, ["inspectionDate", "createdAt", "updatedAt"]),
    unit: hydrateUnitBare(store, store.units.find((item) => item.id === inspection.unitId)!),
    lease: inspection.leaseId ? hydrateLease(store, store.leases.find((item) => item.id === inspection.leaseId)!) : null
  };
}

async function createUploadedFiles(store: AppStore, items: Partial<UploadedFile>[]) {
  for (const item of items) {
    store.uploadedFiles.push({
      id: createId("file"),
      createdAt: nowIso(),
      mimeType: item.mimeType ?? "image/*",
      kind: item.kind as any,
      path: item.path!,
      label: item.label,
      propertyId: item.propertyId,
      unitId: item.unitId,
      inspectionId: item.inspectionId,
      assessmentId: item.assessmentId
    });
  }
}

export const db: any = {
  user: {
    async findMany({ where, orderBy, include }: any = {}) {
      const store = await readStore();
      let items = store.users
        .map(withEffectiveUserRole)
        .filter((user) => (!where?.organizationId || user.organizationId === where.organizationId) && (!where?.role || user.role === where.role));
      items = sortItems(items, orderBy);
      return items.map((user) => {
        return include?.organization
          ? { ...toDateFields(user, ["createdAt", "updatedAt"]), organization: store.organizations.find((item) => item.id === user.organizationId) }
          : toDateFields(user, ["createdAt", "updatedAt"]);
      });
    },
    async findUnique({ where, include }: any) {
      const store = await readStore();
      const user = where.id ? store.users.find((item) => item.id === where.id) : store.users.find((item) => item.email === where.email);
      if (!user) return null;
      const effectiveUser = withEffectiveUserRole(user);
      return include?.organization
        ? { ...toDateFields(effectiveUser, ["createdAt", "updatedAt"]), organization: store.organizations.find((item) => item.id === user.organizationId) }
        : toDateFields(effectiveUser, ["createdAt", "updatedAt"]);
    },
    async create({ data }: any) {
      const user = {
        id: createId("user"),
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ...data,
        role: getEffectiveUserRole(data.role ?? "MANAGER", data.email)
      };
      await updateStore((store) => ({ ...store, users: [...store.users, user] }));
      return toDateFields(user, ["createdAt", "updatedAt"]);
    },
    async update({ where, data }: any) {
      let updated: any;
      await updateStore((store) => ({
        ...store,
        users: store.users.map((item) => {
          if (item.id !== where.id) return item;
          const next = { ...item, ...data, updatedAt: nowIso() };
          updated = { ...next, role: getEffectiveUserRole(next.role ?? "MANAGER", next.email) };
          return updated;
        })
      }));
      return toDateFields(updated, ["createdAt", "updatedAt"]);
    }
  },
  organization: {
    async create({ data }: any) {
      const organization = { id: createId("org"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, organizations: [...store.organizations, organization] }));
      return toDateFields(organization, ["createdAt", "updatedAt"]);
    },
    async update({ where, data }: any) {
      let updated: any;
      await updateStore((store) => ({
        ...store,
        organizations: store.organizations.map((item) => {
          if (item.id !== where.id) return item;
          updated = { ...item, ...data, updatedAt: nowIso() };
          return updated;
        })
      }));
      return toDateFields(updated, ["createdAt", "updatedAt"]);
    }
  },
  passwordResetToken: {
    async findUnique({ where }: any) {
      const store = await readStore();
      const token = store.passwordResetTokens.find((item) => item.token === where.token);
      return token ? toDateFields(token, ["expiresAt", "usedAt", "createdAt"]) : null;
    },
    async create({ data }: any) {
      const token = { id: createId("reset"), createdAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, passwordResetTokens: [...store.passwordResetTokens, token] }));
      return toDateFields(token, ["expiresAt", "usedAt", "createdAt"]);
    },
    async update({ where, data }: any) {
      let updated: any;
      await updateStore((store) => ({
        ...store,
        passwordResetTokens: store.passwordResetTokens.map((item) => {
          if (item.id !== where.id) return item;
          updated = { ...item, ...data };
          return updated;
        })
      }));
      return toDateFields(updated, ["expiresAt", "usedAt", "createdAt"]);
    },
    async updateMany({ where, data }: any) {
      let count = 0;
      await updateStore((store) => ({
        ...store,
        passwordResetTokens: store.passwordResetTokens.map((item) => {
          if (where?.userId && item.userId !== where.userId) return item;
          if (where?.usedAt === null && item.usedAt) return item;
          count += 1;
          return { ...item, ...data };
        })
      }));
      return { count };
    }
  },
  notification: {
    async findMany({ where, orderBy, take }: any) {
      const store = await readStore();
      return takeItems(
        sortItems(
          store.notifications.filter((item) => (!where?.organizationId || item.organizationId === where.organizationId) && (!where?.userId || item.userId === where.userId)),
          orderBy
        ).map((item) => toDateFields(item, ["createdAt"])),
        take
      );
    },
    async create({ data }: any) {
      const item = { id: createId("note"), isRead: false, createdAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, notifications: [...store.notifications, item] }));
      return toDateFields(item, ["createdAt"]);
    }
  },
  property: {
    async findMany({ where, include, orderBy }: any) {
      const store = await readStore();
      let items = store.properties.filter((item) => !where?.organizationId || item.organizationId === where.organizationId);
      items = sortItems(items, orderBy);
      return items.map((item) => (include ? hydrateProperty(store, item) : toDateFields(item, ["createdAt", "updatedAt"])));
    },
    async findFirst({ where, include }: any) {
      const store = await readStore();
      const item = store.properties.find((property) => property.id === where.id && (!where.organizationId || property.organizationId === where.organizationId));
      if (!item) return null;
      return include ? hydrateProperty(store, item) : toDateFields(item, ["createdAt", "updatedAt"]);
    },
    async create({ data }: any) {
      const property = { id: createId("property"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore(async (store) => {
        const next = { ...store, properties: [...store.properties, property] };
        if (data.files?.create) {
          const files = Array.isArray(data.files.create) ? data.files.create : [data.files.create];
          await createUploadedFiles(next, files.map((file: any) => ({ ...file, propertyId: property.id })));
        }
        return next;
      });
      return toDateFields(property, ["createdAt", "updatedAt"]);
    },
    async update({ where, data }: any) {
      let updated: any;
      await updateStore((store) => ({
        ...store,
        properties: store.properties.map((item) => {
          if (item.id !== where.id) return item;
          updated = { ...item, ...data, updatedAt: nowIso() };
          return updated;
        })
      }));
      return toDateFields(updated, ["createdAt", "updatedAt"]);
    }
  },
  unit: {
    async findMany({ where, include, orderBy }: any) {
      const store = await readStore();
      let items = store.units.filter((unit) => {
        const property = store.properties.find((item) => item.id === unit.propertyId);
        if (where?.property?.organizationId && property?.organizationId !== where.property.organizationId) return false;
        return true;
      });
      items = sortItems(items, orderBy);
      return items.map((item) => (include ? hydrateUnit(store, item) : toDateFields(item, ["createdAt", "updatedAt"])));
    },
    async findFirst({ where, include }: any) {
      const store = await readStore();
      const item = store.units.find((unit) => {
        if (where.id && unit.id !== where.id) return false;
        if (where.property?.organizationId) {
          const property = store.properties.find((candidate) => candidate.id === unit.propertyId);
          if (property?.organizationId !== where.property.organizationId) return false;
        }
        return true;
      });
      if (!item) return null;
      return include ? hydrateUnit(store, item) : toDateFields(item, ["createdAt", "updatedAt"]);
    },
    async create({ data }: any) {
      const unit = { id: createId("unit"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore(async (store) => {
        const next = { ...store, units: [...store.units, unit] };
        if (data.files?.create) {
          await createUploadedFiles(next, data.files.create.map((file: any) => ({ ...file, unitId: unit.id })));
        }
        return next;
      });
      return toDateFields(unit, ["createdAt", "updatedAt"]);
    },
    async update({ where, data }: any) {
      let updated: any;
      await updateStore((store) => ({
        ...store,
        units: store.units.map((item) => {
          if (item.id !== where.id) return item;
          updated = { ...item, ...data, updatedAt: nowIso() };
          return updated;
        })
      }));
      return toDateFields(updated, ["createdAt", "updatedAt"]);
    }
  },
  tenant: {
    async findMany({ where, include, orderBy }: any) {
      const store = await readStore();
      let items = store.tenants.filter((tenant) => !where?.organizationId || tenant.organizationId === where.organizationId);
      items = sortItems(items, orderBy);
      return items.map((tenant) => {
        if (!include) return toDateFields(tenant, ["createdAt", "updatedAt"]);
        return {
          ...toDateFields(tenant, ["createdAt", "updatedAt"]),
          leaseTenants: store.leases
            .filter((lease) => lease.tenantIds.includes(tenant.id))
            .map((lease) => ({ lease: hydrateLease(store, lease) }))
        };
      });
    },
    async create({ data }: any) {
      const tenant = { id: createId("tenant"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, tenants: [...store.tenants, tenant] }));
      return toDateFields(tenant, ["createdAt", "updatedAt"]);
    }
  },
  lease: {
    async findMany({ where, include, orderBy }: any) {
      const store = await readStore();
      let items = store.leases.filter((lease) => {
        const property = findPropertyForLease(store, lease);
        if (where?.unit?.property?.organizationId && property?.organizationId !== where.unit.property.organizationId) return false;
        return true;
      });
      items = sortItems(items, orderBy);
      return items.map((lease) => (include ? hydrateLease(store, lease) : toDateFields(lease, ["startDate", "endDate", "createdAt", "updatedAt"])));
    },
    async create({ data }: any) {
      const lease = {
        id: createId("lease"),
        tenantIds: data.tenants?.create ? [data.tenants.create.tenantId] : [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ...data
      };
      delete lease.tenants;
      await updateStore((store) => ({ ...store, leases: [...store.leases, lease] }));
      return toDateFields(lease, ["startDate", "endDate", "createdAt", "updatedAt"]);
    }
  },
  payment: {
    async findMany({ where, include, orderBy }: any) {
      const store = await readStore();
      let items = store.payments.filter((payment) => {
        const property = findPropertyForUnit(store, payment.unitId);
        if (where?.unit?.property?.organizationId && property?.organizationId !== where.unit.property.organizationId) return false;
        return true;
      });
      items = sortItems(items, orderBy);
      return items.map((item) => (include ? hydratePayment(store, item) : toDateFields(item, ["dueDate", "paidDate", "createdAt", "updatedAt"])));
    },
    async findFirst({ where, include }: any) {
      const store = await readStore();
      const item = store.payments.find((payment) => !where?.id || payment.id === where.id);
      if (!item) return null;
      return include ? hydratePayment(store, item) : toDateFields(item, ["dueDate", "paidDate", "createdAt", "updatedAt"]);
    },
    async create({ data }: any) {
      const payment = { id: createId("payment"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, payments: [...store.payments, payment] }));
      return toDateFields(payment, ["dueDate", "paidDate", "createdAt", "updatedAt"]);
    },
    async update({ where, data }: any) {
      let updated: any;
      await updateStore((store) => ({
        ...store,
        payments: store.payments.map((item) => {
          if (item.id !== where.id) return item;
          updated = { ...item, ...data, updatedAt: nowIso() };
          return updated;
        })
      }));
      return toDateFields(updated, ["dueDate", "paidDate", "createdAt", "updatedAt"]);
    }
  },
  expense: {
    async findMany({ where, include, orderBy, take }: any) {
      const store = await readStore();
      let items = store.expenses.filter((expense) => {
        const property = store.properties.find((item) => item.id === expense.propertyId);
        if (where?.property?.organizationId && property?.organizationId !== where.property.organizationId) return false;
        return true;
      });
      items = takeItems(sortItems(items, orderBy), take);
      return items.map((item) => (include ? hydrateExpense(store, item) : toDateFields(item, ["incurredAt", "createdAt", "updatedAt"])));
    },
    async create({ data }: any) {
      const expense = { id: createId("expense"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, expenses: [...store.expenses, expense] }));
      return toDateFields(expense, ["incurredAt", "createdAt", "updatedAt"]);
    }
  },
  maintenanceRequest: {
    async findMany({ where, include, orderBy, take }: any) {
      const store = await readStore();
      let items = store.maintenanceRequests.filter((item) => {
        const property = store.properties.find((candidate) => candidate.id === item.propertyId);
        if (where?.property?.organizationId && property?.organizationId !== where.property.organizationId) return false;
        return true;
      });
      items = takeItems(sortItems(items, orderBy), take);
      return items.map((item) => (include ? hydrateMaintenance(store, item) : toDateFields(item, ["requestedAt", "resolvedAt", "createdAt", "updatedAt"])));
    },
    async create({ data }: any) {
      const item = { id: createId("maint"), requestedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, maintenanceRequests: [...store.maintenanceRequests, item] }));
      return toDateFields(item, ["requestedAt", "resolvedAt", "createdAt", "updatedAt"]);
    },
    async update({ where, data }: any) {
      let updated: any;
      await updateStore((store) => ({
        ...store,
        maintenanceRequests: store.maintenanceRequests.map((item) => {
          if (item.id !== where.id) return item;
          updated = { ...item, ...data, updatedAt: nowIso() };
          return updated;
        })
      }));
      return updated ? toDateFields(updated, ["requestedAt", "resolvedAt", "createdAt", "updatedAt"]) : null;
    }
  },
  inspection: {
    async create({ data }: any) {
      const inspection: Inspection = { id: createId("insp"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore(async (store) => {
        const next = { ...store, inspections: [...store.inspections, inspection] };
        if (data.files?.create) {
          await createUploadedFiles(next, data.files.create.map((file: any) => ({ ...file, inspectionId: inspection.id })));
        }
        return next;
      });
      return toDateFields(inspection, ["inspectionDate", "createdAt", "updatedAt"]);
    }
  },
  damageAssessment: {
    async findMany({ where, include, orderBy, take }: any) {
      const store = await readStore();
      let items = store.damageAssessments.filter((assessment) => {
        const inspection = store.inspections.find((item) => item.id === assessment.inspectionId);
        const property = inspection ? findPropertyForUnit(store, inspection.unitId) : null;
        if (where?.inspection?.unit?.property?.organizationId && property?.organizationId !== where.inspection.unit.property.organizationId) return false;
        return true;
      });
      items = takeItems(sortItems(items, orderBy), take);
      return items.map((item) => (include ? hydrateAssessment(store, item) : toDateFields(item, ["createdAt", "updatedAt"])));
    },
    async create({ data }: any) {
      const assessment: DamageAssessment = { id: createId("assess"), createdAt: nowIso(), updatedAt: nowIso(), ...data };
      await updateStore(async (store) => {
        const next = { ...store, damageAssessments: [...store.damageAssessments, assessment] };
        if (data.files?.create) {
          await createUploadedFiles(next, data.files.create.map((file: any) => ({ ...file, assessmentId: assessment.id })));
        }
        return next;
      });
      return toDateFields(assessment, ["createdAt", "updatedAt"]);
    }
  },
  uploadedFile: {
    async create({ data }: any) {
      const file = { id: createId("file"), createdAt: nowIso(), ...data };
      await updateStore((store) => ({ ...store, uploadedFiles: [...store.uploadedFiles, file] }));
      return toDateFields(file, ["createdAt"]);
    }
  }
};
