import { z } from "zod";

export const signupSchema = z
  .object({
    businessName: z.string().min(2),
    role: z.enum(["MANAGER", "TENANT"]),
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    phone: z.string().optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const requestResetSchema = z.object({
  email: z.string().email()
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

export const propertySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  amenities: z.string().optional(),
  notes: z.string().optional(),
  managerId: z.string().optional()
});

export const unitSchema = z.object({
  propertyId: z.string().min(1),
  unitNumber: z.string().min(1),
  nickname: z.string().optional(),
  unitType: z.string().min(2),
  bedrooms: z.coerce.number().min(0),
  bathrooms: z.coerce.number().min(0.5),
  squareFeet: z.coerce.number().optional(),
  monthlyRent: z.coerce.number().min(0),
  depositAmount: z.coerce.number().min(0),
  occupancyStatus: z.enum(["OCCUPIED", "VACANT", "NOTICE", "TURNOVER"]),
  leaseStatus: z.enum(["ACTIVE", "UPCOMING", "EXPIRED", "TERMINATED"]),
  amenities: z.string().optional(),
  notes: z.string().optional()
});

export const tenantSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  employer: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  notes: z.string().optional()
});

export const leaseSchema = z.object({
  unitId: z.string().min(1),
  tenantId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  monthlyRent: z.coerce.number().min(0),
  dueDay: z.coerce.number().min(1).max(28),
  securityDeposit: z.coerce.number().min(0),
  recurringCharges: z.string().optional(),
  lateFeePolicy: z.string().optional(),
  notes: z.string().optional(),
  documentPath: z.string().optional(),
  status: z.enum(["ACTIVE", "UPCOMING", "EXPIRED", "TERMINATED"])
});

export const paymentSchema = z.object({
  unitId: z.string().min(1),
  leaseId: z.string().optional(),
  description: z.string().min(2),
  amount: z.coerce.number().min(0),
  dueDate: z.string().min(1),
  paidDate: z.string().optional(),
  status: z.enum(["PENDING", "PAID", "PARTIAL", "LATE"]),
  lateFeeAmount: z.coerce.number().optional(),
  balanceDue: z.coerce.number().optional(),
  categoryTag: z.string().optional()
});

export const expenseSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  amount: z.coerce.number().min(0),
  incurredAt: z.string().min(1),
  category: z.enum(["MAINTENANCE", "REPAIR", "UTILITIES", "INSURANCE", "TAX", "CLEANING", "MARKETING", "OTHER"]),
  tags: z.string().optional(),
  vendor: z.string().optional()
});

export const maintenanceSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().min(4),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  estimatedCost: z.coerce.number().optional(),
  actualCost: z.coerce.number().optional(),
  assignedTo: z.string().optional(),
  timeline: z.string().optional()
});

export const settingsSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional()
});

export const damageAssessmentSchema = z.object({
  unitId: z.string().min(1),
  leaseId: z.string().optional(),
  inspectionDate: z.string().min(1),
  notes: z.string().optional(),
  imagePaths: z.array(z.string()).min(1),
  baselinePaths: z.array(z.string()).optional()
});
