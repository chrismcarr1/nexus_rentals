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
- `TenantInvite`

Relationship highlights:

- `Organization -> Properties -> Units`
- `Units -> Leases -> Tenants`
- `Managers -> Leases -> TenantInvites -> Tenant accounts`
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

Demo credentials are generated fresh each time you intentionally seed demo data. Run the seed command with `ALLOW_DEMO_SEED=true`, then use the passwords printed once in your terminal.

System admin access is reserved for the email in `SYSTEM_ADMIN_EMAIL` and should be provisioned manually without storing a plaintext password.

## Password Reset Demo

- Configure Cloudflare Email Service, then request a reset from `/forgot-password`.
- Reset tokens are stored only as hashes and are never printed to logs or returned in page URLs.

## Environment Variables

Copy `.env.example` to `.env.local` and use:

```env
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
AUTH_SECRET="change-this-to-a-long-random-string"
SYSTEM_ADMIN_EMAIL="admin@example.com"
APP_URL="http://localhost:3000"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
CHECKR_API_KEY=""
CHECKR_PACKAGE_SLUG=""
CHECKR_WEBHOOK_SECRET=""
CHECKR_MOCK_MODE="true"
PLAID_CLIENT_ID=""
PLAID_SECRET=""
PLAID_PUBLIC_KEY=""
PLAID_ENV="sandbox"
PLAID_WEBHOOK_SECRET=""
PLAID_MOCK_MODE="true"
NEXT_PUBLIC_PLAID_ENV="sandbox"
SCREENING_ENCRYPTION_KEY=""
SCREENING_APPROVED_MAX_RISK="25"
SCREENING_HIGH_RISK_MIN="61"
SCREENING_STRONG_INCOME_RATIO="3"
SCREENING_REVIEW_INCOME_RATIO="2.5"
SCREENING_MINIMUM_INCOME_RATIO="2"
OPENAI_API_KEY=""
OPENAI_MAINTENANCE_MODEL="gpt-5.5"
BLOB_READ_WRITE_TOKEN=""
CLOUDFLARE_EMAIL_FROM="Nexus Rentals <no-reply@yourdomain.com>"
CLOUDFLARE_EMAIL_WORKER_URL=""
CLOUDFLARE_EMAIL_WORKER_SECRET=""
CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_EMAIL_API_TOKEN=""
```

`DATABASE_URL` can come from Vercel Postgres, Neon, Supabase Postgres, or another hosted Postgres provider. `BLOB_READ_WRITE_TOKEN` is optional for local development, where uploads fall back to `public/uploads`, but it is required in Vercel production for persistent photos and documents.

Tenant invite and password reset emails use Cloudflare Email Service. Set `APP_URL` to the public Nexus production origin, never a Vercel preview URL, and set `CLOUDFLARE_EMAIL_FROM` plus either `CLOUDFLARE_EMAIL_WORKER_URL` and `CLOUDFLARE_EMAIL_WORKER_SECRET`, or `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_EMAIL_API_TOKEN`. Invite tokens are stored only as SHA-256 hashes in the hosted datastore; the raw token appears only in the tenant email link.

For the Worker option, copy `cloudflare/wrangler.email-worker.toml.example` to your Worker Wrangler config, update the sender address, deploy `cloudflare/email-worker.js`, and set the same secret in Cloudflare as `NEXUS_EMAIL_SECRET` and in Nexus as `CLOUDFLARE_EMAIL_WORKER_SECRET`. The Worker accepts either an `EMAIL` or `SEND_EMAIL` binding.

Run `npm run email:check` to verify local email environment variables and Worker DNS without printing secrets. Logged-in managers and admins can also inspect `/api/email/diagnostics`; add `?probe=1` to test the Worker health endpoint after deploying the Nexus Worker code.

Stripe rent checkout uses Connect destination charges. Tenant payments are created from the Nexus platform account, routed to the manager's connected Stripe account with `transfer_data.destination`, and include a fixed $1 Nexus platform fee through `application_fee_amount`.

### Tenant screening

Application submissions now have an optional screening workflow backed by relational Postgres tables. Managers can start a Checkr hosted candidate invitation or a full Checkr + Plaid screening from the submission review page. Applicants use a short-lived secure Nexus portal link to consent to Plaid identity and income verification. Nexus stores normalized provider results, encrypted Plaid tokens, webhook events, and a configurable decision-support recommendation; it never automatically approves or rejects an applicant.

Run `npm run db:migrate` after deploying this version. Configure the Checkr webhook as `/api/webhooks/checkr` and the Plaid webhook as `/api/webhooks/plaid` on the canonical `APP_URL`. Plaid production webhooks use the official `Plaid-Verification` signed JWT. `PLAID_WEBHOOK_SECRET` is available only as a compatibility fallback for a trusted proxy or local test harness.

For local demos, keep `CHECKR_MOCK_MODE=true` and `PLAID_MOCK_MODE=true`. Mock Checkr completes with a clear report, and mock Plaid returns matching identity plus sample verified income without making external API calls. Set both flags to `false` before using provider sandbox or production credentials.

The screening recommendation uses only provider disposition, identity match, and income-to-rent inputs. Thresholds are intentionally conservative and the landlord remains responsible for lawful criteria, individualized assessment, FCRA notices, fair-housing compliance, and the final decision.

AI photo maintenance drafting uses OpenAI's Responses API with image inputs. Add `OPENAI_API_KEY` locally and in Vercel; `OPENAI_MAINTENANCE_MODEL` is optional and defaults to `gpt-5.5`.

## Setup

```bash
npm install
copy .env.example .env.local
npm run db:migrate
$env:ALLOW_DEMO_SEED="true"; npm run db:setup
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
$env:ALLOW_DEMO_SEED="true"; npm run db:setup
npm run dev
```

Local URL:

```text
http://localhost:3000
```

## Datastore Commands

- Create the hosted Postgres table: `npm run db:migrate`
- Initialize hosted demo data: `$env:ALLOW_DEMO_SEED="true"; npm run db:setup`
- Reseed demo data: `$env:ALLOW_DEMO_SEED="true"; npm run db:seed`
- `npm run db:push` runs the same lightweight hosted table migration as `npm run db:migrate`

## Vercel Deployment

Required Vercel environment variables:

```text
DATABASE_URL
AUTH_SECRET
SYSTEM_ADMIN_EMAIL
APP_URL
```

Required Vercel environment variable for uploads:

```text
BLOB_READ_WRITE_TOKEN
```

Required Vercel environment variables for tenant invite and password reset emails:

```text
APP_URL
CLOUDFLARE_EMAIL_FROM
CLOUDFLARE_EMAIL_WORKER_URL
CLOUDFLARE_EMAIL_WORKER_SECRET
```

Set `APP_URL` to the canonical public custom domain, such as `https://app.nexusrentals.co`. Do not set it to `VERCEL_URL`, a `*.vercel.app` deployment, or localhost in production.

If you do not use the Worker bridge, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_EMAIL_API_TOKEN` instead of the Worker URL and secret.

Required Vercel environment variable for AI photo maintenance drafting:

```text
OPENAI_API_KEY
```

Required Vercel environment variables for live tenant screening:

```text
CHECKR_API_KEY
CHECKR_PACKAGE_SLUG
CHECKR_WEBHOOK_SECRET
CHECKR_MOCK_MODE=false
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV=production
PLAID_MOCK_MODE=false
NEXT_PUBLIC_PLAID_ENV=production
SCREENING_ENCRYPTION_KEY
```

Optional AI model override:

```text
OPENAI_MAINTENANCE_MODEL
```

Recommended setup:

1. Create or attach a hosted Postgres database, such as Vercel Postgres or Neon.
2. Add the database connection string to Vercel as `DATABASE_URL`.
3. Set `AUTH_SECRET` to a long random string.
4. Set `APP_URL` to the public custom Nexus domain. Do not use a Vercel preview or protected deployment URL.
5. Attach Vercel Blob and add `BLOB_READ_WRITE_TOKEN` so production uploads persist.
6. Configure Cloudflare Email Service and add the Cloudflare email environment variables so tenant invites and password resets can be delivered.
7. Add `OPENAI_API_KEY` so AI photo maintenance drafting can analyze uploaded images.
8. Run `npm run db:migrate` against the production database to create the table.
9. Avoid seeding demo accounts in production. If you intentionally need demo data in a disposable environment, run `$env:ALLOW_DEMO_SEED="true"; npm run db:setup` and rotate the generated credentials afterward.
10. Deploy normally with Vercel. The project declares Node `22.x` in `package.json`.

## Key Pages

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/invite/[token]`
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
