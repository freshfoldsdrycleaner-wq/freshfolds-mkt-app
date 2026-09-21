# Fresh Fold — Stage 1 + Stage 2

"Your local dry-cleaning service, simplified." A Zomato-style marketplace
connecting customers with local dry-cleaners, built free-tier-first.

This build covers **Stage 1** (auth, search, order placement with
server-side pricing/commission) **and Stage 2**: mandatory pickup photos,
defect/no-defect recording with customer sign-off, vendor
self-registration + admin approval, a full catalog-change approval
workflow, post-inspection price correction, and remaining-payment
confirmation. There is still **no UI** beyond a placeholder page — every
endpoint below is meant to be tested with curl or an API client for now.

## Email-based login (for admin accounts)

`/api/auth/request-otp` and `/api/auth/verify-otp` now accept either
`{ phone }` or `{ email }` — the OTP goes to whichever channel was used.
This is meant for accounts like the platform admin that log in by email
rather than phone. Two things worth knowing:
- A **brand-new** account can still only be created via phone (`phone` is
  a required, unique column) — requesting an OTP for an email that
  doesn't exist yet returns a 404 rather than silently creating a
  phone-less user. Attach an email to an existing phone-based account by
  passing both `phone` and `email` in the same request.
- The email OTP is sent through `getEmailOtpProvider()` in
  `src/lib/providers/otp.ts` — mocked (logged to the console) for now,
  same pattern as the SMS provider; swap in SES/Postmark later.

## What's new in Stage 2

- **Pickup photos & defects** (`/api/orders/:id/photos`, `/api/orders/:id/defects`) — the delivery person assigned to an order's pickup records photos and either a defect or an explicit "no defects found." The order can't move to `PICKED_UP` until both that record *and* the customer's sign-off (`/api/orders/:id/pickup-confirmation`) exist — enforced by the state machine, not just convention.
- **Delivery assignment** (`/api/orders/:id/assign`) — the dry-cleaner assigns one of their own `DELIVERY_PERSON` accounts to a pickup or delivery; this is also what makes that person eligible to touch the order at all.
- **Vendor self-registration + approval** (`POST /api/drycleaners`, `GET /api/admin/drycleaners`, `POST /api/admin/drycleaners/:id/status`) — a dry-cleaner account can register their own business, but it starts `PENDING` and is invisible to customer search until a `FRESHFOLD_ADMIN` approves it.
- **Catalog-change approval workflow** (`PATCH /api/drycleaners/:id/services/:serviceId`, `POST /api/admin/services/:serviceId`) — a dry-cleaner's own price/discount/photo edits or removals never take effect immediately; they sit as `PENDING_EDIT`/`PENDING_DELETE`/`PENDING_NEW` until an admin approves or rejects them. The rules live in `src/lib/serviceApproval.ts` (pure, unit-tested) so the API route just persists whatever it returns. An admin's own additions/edits take effect immediately, since there's no one above them to approve it.
- **Post-inspection price correction** (`/api/orders/:id/final-price`) — recalculates commission, dry-cleaner net, and the customer's remaining balance from the *locked-in* commission rate, matching the worked examples in the spec.
- **Final payment confirmation** (`/api/orders/:id/payment/final`) — either the customer or the dry-cleaner can confirm the remaining balance was paid; it's verified server-side and only then does the order move `PAYMENT_PENDING → PAYMENT_COMPLETED`.

## Why this stack

| Layer          | Choice                          | Why |
|----------------|----------------------------------|-----|
| Frontend/API   | Next.js 14 (App Router) + TS    | One deployable app for pages + API routes; generous free tier on Vercel |
| Database       | PostgreSQL via Prisma            | Relational integrity for money/state-machine data; Prisma migrations are free/open-source |
| DB hosting     | Supabase or Neon free tier       | Free Postgres with enough storage/connections for an MVP |
| Auth           | Custom OTP + JWT                 | No paid auth vendor required; OTP delivery is abstracted (see below) |
| File storage   | Supabase Storage free tier       | For pickup photos — never store images in Postgres, only their URL |
| Hosting        | Vercel free tier                 | Native Next.js support, generous free hobby tier |

## What's genuinely free vs. eventually paid

- **Free / open-source forever:** Next.js, TypeScript, Prisma, PostgreSQL itself, the OTP/payment/notification abstractions and their mock implementations, this entire codebase.
- **Free tier today, may need upgrading with scale:** Supabase/Neon Postgres (row/storage limits), Supabase Storage, Vercel hosting (bandwidth/function limits).
- **Will cost real money eventually:** a real SMS OTP provider (MSG91/Twilio), a real payment gateway (Razorpay/Stripe) and its transaction fees, a production object-storage bill once photo volume grows, a paid Maps/Places API if you outgrow haversine-based search.

## Project structure

```
freshfold/
├── prisma/
│   ├── schema.prisma          # full data model (users, orders, commission, service approvals, etc.)
│   └── seed.ts                 # sample admin / two dry-cleaners (one ACTIVE, one PENDING) / prices / customer / delivery person
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/{request-otp,verify-otp}/route.ts
│   │   │   ├── drycleaners/route.ts                 # nearby search (GET) + self-registration (POST)
│   │   │   ├── drycleaners/[id]/route.ts             # profile + live catalog
│   │   │   ├── drycleaners/[id]/services/route.ts    # list/add services (approval-gated)
│   │   │   ├── drycleaners/[id]/services/[serviceId]/route.ts  # propose edit/delete
│   │   │   ├── admin/drycleaners/route.ts            # list, filterable by status
│   │   │   ├── admin/drycleaners/[id]/status/route.ts  # approve/suspend/reactivate
│   │   │   ├── admin/services/[serviceId]/route.ts   # approve/reject a pending catalog change
│   │   │   └── orders/
│   │   │       ├── route.ts                    # create + list
│   │   │       ├── [id]/route.ts               # full detail
│   │   │       ├── [id]/status/route.ts        # state-machine-guarded transitions
│   │   │       ├── [id]/assign/route.ts        # assign a delivery person
│   │   │       ├── [id]/photos/route.ts        # pickup photos
│   │   │       ├── [id]/defects/route.ts       # defect / no-defect recording
│   │   │       ├── [id]/pickup-confirmation/route.ts  # customer sign-off
│   │   │       ├── [id]/final-price/route.ts   # post-inspection correction
│   │   │       └── [id]/payment/final/route.ts # remaining-payment confirmation
│   │   ├── layout.tsx / page.tsx / globals.css  # placeholder shell
│   ├── lib/
│   │   ├── prisma.ts            # PrismaClient singleton
│   │   ├── auth.ts              # JWT session issue/verify, RBAC helpers
│   │   ├── pricing.ts           # booking payment + commission + discount math (unit-tested)
│   │   ├── geo.ts               # haversine distance, no paid Maps API
│   │   ├── orderStateMachine.ts # the only place status transitions are legal
│   │   ├── serviceApproval.ts   # the only place catalog-change approval logic lives (unit-tested)
│   │   └── providers/
│   │       ├── otp.ts           # OtpProvider interface + MockOtpProvider
│   │       ├── payment.ts       # PaymentProvider interface + MockPaymentProvider
│   │       └── notification.ts  # NotificationProvider interface + mock
│   └── types/index.ts
└── tests/
    ├── pricing.test.ts
    ├── orderStateMachine.test.ts
    └── serviceApproval.test.ts
```

## Order state machine (section 39)

```
ORDER_PLACED → PICKUP_ASSIGNED → PICKUP_IN_PROGRESS → PICKED_UP
  → RECEIVED_BY_DRY_CLEANER → INSPECTION → PROCESSING → QUALITY_CHECK
  → COMPLETED → PAYMENT_PENDING → PAYMENT_COMPLETED → DELIVERY_ASSIGNED
  → OUT_FOR_DELIVERY → DELIVERED → CLOSED
```
Cancellation is only allowed from `ORDER_PLACED`, `PICKUP_ASSIGNED`, or
`PICKUP_IN_PROGRESS`. Moving to `PICKED_UP` additionally requires a
recorded condition report **and** the customer's sign-off on it — both
enforced in `src/app/api/orders/[id]/status/route.ts`, not just the
state machine's own guard. The `hasDeliveryOtpVerification` guard is
still reserved (unwired) for a future delivery-OTP stage.

## Commission & catalog-approval math

`src/lib/pricing.ts` computes every money figure — booking payment,
commission, discount-adjusted prices, and the post-inspection
recalculation — matching the spec's worked examples exactly (see
`tests/pricing.test.ts`). `src/lib/serviceApproval.ts` is the equivalent
for catalog changes: what "propose an edit," "propose a removal,"
"approve," and "reject" each do to a service row (see
`tests/serviceApproval.test.ts`).

## Setup

```bash
cp .env.example .env
# fill in DATABASE_URL (Supabase/Neon connection string) and a JWT_SECRET

npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

The app serves at http://localhost:3000 — the placeholder home page lists
every available endpoint.

## Testing

```bash
npm test
```

Runs the pricing-math, state-machine, and service-approval unit tests.

## Trying the new Stage 2 flow end-to-end

```bash
# Assumes you already have a CUSTOMER token (see auth/request-otp + verify-otp)
# and an order id from POST /api/orders.

# 1. Dry-cleaner assigns a delivery person to the pickup
curl -X POST localhost:3000/api/orders/<orderId>/assign \
  -H "Authorization: Bearer <dryCleanerToken>" -H "Content-Type: application/json" \
  -d '{"deliveryPersonId":"<userId>","assignmentType":"PICKUP"}'

# 2. Delivery person uploads a pickup photo (URL only — never raw bytes)
curl -X POST localhost:3000/api/orders/<orderId>/photos \
  -H "Authorization: Bearer <deliveryToken>" -H "Content-Type: application/json" \
  -d '{"photoUrl":"https://storage.example.com/photo1.jpg","itemRef":"shirt-1"}'

# 3. Delivery person records the condition ("no defects found" here)
curl -X POST localhost:3000/api/orders/<orderId>/defects \
  -H "Authorization: Bearer <deliveryToken>" -H "Content-Type: application/json" \
  -d '{"found":false}'

# 4. Customer reviews and signs off
curl -X POST localhost:3000/api/orders/<orderId>/pickup-confirmation \
  -H "Authorization: Bearer <customerToken>"

# 5. Now (and only now) PICKED_UP is a legal transition
curl -X POST localhost:3000/api/orders/<orderId>/status \
  -H "Authorization: Bearer <deliveryToken>" -H "Content-Type: application/json" \
  -d '{"status":"PICKED_UP"}'

# 6. ...advance through RECEIVED_BY_DRY_CLEANER / INSPECTION / PROCESSING /
#    QUALITY_CHECK / COMPLETED the same way, then correct the final price:
curl -X POST localhost:3000/api/orders/<orderId>/final-price \
  -H "Authorization: Bearer <dryCleanerToken>" -H "Content-Type: application/json" \
  -d '{"finalTotal":1200}'

# 7. Move to PAYMENT_PENDING, then confirm the remaining balance was paid
curl -X POST localhost:3000/api/orders/<orderId>/status \
  -H "Authorization: Bearer <dryCleanerToken>" -H "Content-Type: application/json" \
  -d '{"status":"PAYMENT_PENDING"}'
curl -X POST localhost:3000/api/orders/<orderId>/payment/final \
  -H "Authorization: Bearer <customerToken>"

# --- Vendor registration + catalog approval ---

# A brand-new dry-cleaner registers (starts PENDING, invisible to search)
curl -X POST localhost:3000/api/drycleaners \
  -H "Authorization: Bearer <newDryCleanerToken>" -H "Content-Type: application/json" \
  -d '{"businessName":"Sunshine Dry Cleaners","phone":"9800000099","address":"12 MG Road","latitude":28.6,"longitude":77.2}'

# Admin approves it
curl -X POST localhost:3000/api/admin/drycleaners/<id>/status \
  -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}'

# Dry-cleaner proposes a price edit — NOT live yet
curl -X PATCH localhost:3000/api/drycleaners/<id>/services/<serviceId> \
  -H "Authorization: Bearer <dryCleanerToken>" -H "Content-Type: application/json" \
  -d '{"action":"edit","changes":{"price":150,"discountPercent":10}}'

# Admin approves the pending change — now it's live
curl -X POST localhost:3000/api/admin/services/<serviceId> \
  -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" \
  -d '{"action":"approve"}'
```

## Roadmap (remaining stages)

- **Stage 3:** OTP-verified delivery confirmation (wires the still-unused
  `hasDeliveryOtpVerification` guard), disputes, ratings.
- **Stage 4:** admin financial/commission dashboard stats endpoint, rate
  limiting, audit-log viewer.
- **Stage 5:** the actual UI for all four roles (customer app, dry-cleaner
  dashboard, delivery app, admin panel) — currently API-only.

Each stage should be requested and delivered on its own so it stays
testable, per the original brief.

