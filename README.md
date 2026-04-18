# Northstar Rent OS

Northstar Rent OS is a polished local-first MVP for landlord and property-operator workflows. It combines secure authentication, portfolio management, leasing, rent and expense tracking, maintenance operations, reporting, and an AI-style damage estimation flow suitable for partner demos.

## Product Overview

Use this demo to show:

- A portfolio dashboard with occupancy, rent collection, overdue balances, expenses, deposits held, NOI-style cash flow, notifications, and recent AI assessments.
- Property, unit, tenant, lease, payment, expense, maintenance, and settings workflows in one cohesive B2B interface.
- A modular AI damage estimation feature that analyzes uploaded inspection photos and produces a structured repair estimate with severity, confidence, explanation, and recommended next steps.

## Stack Choices

- Frontend and backend: `Next.js` App Router with server actions and API routes
- Language: `TypeScript`
- Styling: `Tailwind CSS`
- Local persistence: file-backed local datastore initialized by `npm run db:setup`
- Auth: secure custom cookie/JWT auth with `jose` and `bcryptjs`
- Charts: `Recharts`
- Validation: `zod`
- Local file storage: `public/uploads`

### Why the local datastore

The original architecture targeted Prisma plus SQLite, and a Prisma schema is still included as a future reference model. In this Windows/Node environment, Prisma engine compatibility blocked reliable local setup, so the runtime persistence layer was switched to a deterministic file-backed datastore to keep the app runnable and demoable without changing the product architecture.

## Architecture

- `app/`: pages, layouts, server actions, and API routes
- `components/`: reusable UI, dashboard, and upload components
- `lib/`: auth, local datastore adapter, validation, utilities
- `services/`: financial rollups, search, AI damage estimation logic
- `prisma/`: future relational schema reference
- `scripts/`: local datastore initializer
- `public/demo/`: bundled local demo visuals
- `public/uploads/`: runtime upload destination
- `tests/`: critical unit tests for core local logic

## Data Model

Primary entities:

- `Organization`
- `User`
- `Property`
- `Unit`
- `Tenant`
- `Lease`
- `LeaseTenant`
- `Payment`
- `Expense`
- `MaintenanceRequest`
- `Inspection`
- `DamageAssessment`
- `UploadedFile`
- `Notification`
- `PasswordResetToken`

Relationship highlights:

- `Organization -> Properties -> Units`
- `Units -> Leases -> Tenants`
- `Properties/Units -> Payments, Expenses, Maintenance`
- `Units -> Inspections -> DamageAssessments`
- `UploadedFile` links local assets to properties, units, inspections, and assessments

## AI Damage Estimation Approach

The damage workflow is intentionally modular.

- `services/damage-estimator.ts` is the AI service boundary.
- Version 1 uses a structured heuristic model based on inspection notes, image count, baseline photo presence, and category-based repair ranges.
- The result shape is production-style: summary, categories, severity, cost range, confidence, wear-and-tear flag, explanation, and next steps.
- This service can later be replaced by a real multimodal provider without redesigning the rest of the app.

## Demo Credentials

- Admin: `demo@northstar.local` / `DemoPass123!`
- Manager: `manager@northstar.local` / `ManagerPass123!`
- Tenant: `tenant@northstar.local` / `TenantPass123!`

## Password Reset Demo

- Seeded reset token: `demo-reset-token`
- Open `/reset-password` and submit the token with a new password

## Environment Variables

Copy `.env.example` to `.env` and use:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="change-this-to-a-long-random-string"
APP_URL="http://localhost:3000"
```

## Setup

```bash
npm install
copy .env.example .env
npm run db:setup
npm run dev
```

Open:

```text
http://localhost:3000
```

## Exact Local Run Sequence

```bash
npm install
copy .env.example .env
npm run db:setup
npm run dev
```

Local URL:

```text
http://localhost:3000
```

## Datastore Commands

- Initialize local data: `npm run db:setup`
- Reseed demo data: `npm run db:seed`
- `npm run db:push`, `npm run db:generate`, and `npm run db:migrate` are no-op compatibility scripts in this local build

## Key Pages

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/dashboard`
- `/properties`
- `/properties/[propertyId]`
- `/units/[unitId]`
- `/tenants`
- `/leases`
- `/transactions`
- `/expenses`
- `/maintenance`
- `/ai-assessments`
- `/reports`
- `/settings`

## Critical Local Demo Flows

- Sign in with seeded credentials
- Review dashboard metrics and charts
- Create a property and add a unit
- Upload unit images
- Create tenants, leases, payments, expenses, and maintenance items
- Run a new AI damage estimate with uploaded photos
- Export CSVs from the reports page

## Testing

Run:

```bash
npm test
```

Included tests cover core utility behavior and the damage estimation service.

## Notes for Future Deployment

- Restore a relational database adapter against the included `prisma/schema.prisma` or a cloud database of choice
- Replace local upload storage with S3 or another object store behind the existing upload abstraction
- Replace the heuristic damage estimator with a real multimodal model while preserving the current assessment contract
- If this machine is kept on Node `24`, keep the current runtime workaround or move the app to a verified Node `22` project runtime for Next.js
