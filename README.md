# Nexus Rentals

Nexus Rentals is a rental operations app for landlord and property-operator workflows. It combines secure authentication, portfolio management, leasing, rent and expense tracking, maintenance operations, reporting, and damage estimation.

## Product Overview

Use this demo to show:

- A portfolio dashboard with occupancy, rent collection, overdue balances, expenses, deposits held, NOI-style cash flow, notifications, and recent AI assessments.
- Property, unit, tenant, lease, payment, expense, maintenance, and settings workflows in one cohesive B2B interface.
- A modular AI damage estimation feature that analyzes uploaded inspection photos and produces a structured repair estimate with severity, confidence, explanation, and recommended next steps.

## Stack Choices

- Frontend and backend: `Next.js` App Router with server actions and API routes
- Language: `TypeScript`
- Styling: `Tailwind CSS`
- Persistence: hosted Postgres document store through `DATABASE_URL`
- Auth: secure custom cookie/JWT auth with `jose` and `bcryptjs`
- Charts: `Recharts`
- Validation: `zod`
- File storage: Vercel Blob when `BLOB_READ_WRITE_TOKEN` is configured

### Persistence approach

The UI and server actions use a Prisma-shaped adapter in `lib/db.ts`. To keep the app small and Vercel-compatible, the adapter stores the existing `AppStore` document in hosted Postgres instead of writing `data/app-db.json`. This preserves the current app behavior while avoiding local JSON, SQLite, or filesystem persistence in production.

## Architecture

- `app/`: pages, layouts, server actions, and API routes
- `components/`: reusable UI, dashboard, and upload components
- `lib/`: auth, hosted datastore adapter, validation, utilities
- `services/`: financial rollups, search, AI damage estimation logic
- `scripts/`: hosted datastore migration and seed scripts
- `public/demo/`: bundled local demo visuals
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

- Admin: `demo@nexusrentals.local` / `DemoPass123!`
- Manager: `manager@nexusrentals.local` / `ManagerPass123!`
- Tenant: `tenant@nexusrentals.local` / `TenantPass123!`

## Password Reset Demo

- Seeded reset token: `demo-reset-token`
- Open `/reset-password` and submit the token with a new password

## Environment Variables

Copy `.env.example` to `.env.local` and use:

```env
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
AUTH_SECRET="change-this-to-a-long-random-string"
APP_URL="http://localhost:3000"
BLOB_READ_WRITE_TOKEN=""
```

`DATABASE_URL` can come from Vercel Postgres, Neon, Supabase Postgres, or another hosted Postgres provider. `BLOB_READ_WRITE_TOKEN` is optional for local development, where uploads fall back to `public/uploads`, but it is required in Vercel production for persistent photos and documents.

## Setup

```bash
npm install
copy .env.example .env.local
npm run db:migrate
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
copy .env.example .env.local
npm run db:migrate
npm run db:setup
npm run dev
```

Local URL:

```text
http://localhost:3000
```

## Datastore Commands

- Create the hosted Postgres table: `npm run db:migrate`
- Initialize hosted demo data: `npm run db:setup`
- Reseed demo data: `npm run db:seed`
- `npm run db:push` runs the same lightweight hosted table migration as `npm run db:migrate`

## Vercel Deployment

Required Vercel environment variables:

```text
DATABASE_URL
AUTH_SECRET
APP_URL
```

Required Vercel environment variable for uploads:

```text
BLOB_READ_WRITE_TOKEN
```

Recommended setup:

1. Create or attach a hosted Postgres database, such as Vercel Postgres or Neon.
2. Add the database connection string to Vercel as `DATABASE_URL`.
3. Set `AUTH_SECRET` to a long random string.
4. Set `APP_URL` to the deployed Vercel URL.
5. Attach Vercel Blob and add `BLOB_READ_WRITE_TOKEN` so production uploads persist.
6. Run `npm run db:migrate` against the production database to create the table.
7. Run `npm run db:setup` once if you want the seeded demo accounts and data in production.
8. Deploy normally with Vercel. The project declares Node `22.x` in `package.json`.

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

## Critical Demo Flows

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

- Replace the hosted document store with a fully relational database adapter if the product needs stronger reporting and multi-user concurrency
- Replace the heuristic damage estimator with a real multimodal model while preserving the current assessment contract
- If this machine is kept on Node `24`, keep the current runtime workaround or move the app to a verified Node `22` project runtime for Next.js
