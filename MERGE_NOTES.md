# Pharmacy ERP — Merge Notes

## Why this exists
Phases 1-7 (+9) were each built as standalone codebases (different folder
layouts, different module systems, different package names/versions — see
chat for the audit). This merge builds ONE real codebase, using Phase 7's
Organization/Branch model as the multi-tenant foundation and porting each
other phase's business logic into it.

## Stack decisions (locked in — don't re-litigate per stage)
- Module system: **CommonJS** (`require`/`module.exports`) — matches
  Phase 3/5/7. Phase 1/2/6 code is ESM and must be converted on port.
- Folder layout: **backend/src/{config,models,middleware,controllers,routes,services,utils}**
  — matches Phase 3/6/7.
- Every business model gets `organizationId` (required) and `branchId`
  (required unless the record is intentionally org-wide).
- Auth: JWT bearer token, bcrypt password hashing, role enum (not a Role
  collection — simpler, matches majority of phases).
- Single AuditLog, single BusinessSettings — no per-module duplicates.

## Stage status
- [x] **Stage 1 — Foundation**: Organization, Branch, User, AuditLog,
      BusinessSettings models; auth middleware (JWT + RBAC); error handler;
      auditLogService; register-organization/login/logout/me routes.
      Syntax-checked (`node --check`), all 16 files pass. **Not yet run
      against a live MongoDB** — no network egress in this sandbox to
      install npm deps or reach a Mongo server. See "What's verified" below.
- [x] **Stage 2 — Catalog & Inventory**: Counter (atomic per-org sequences),
      Category, Manufacturer, Medicine (org-scoped; Phase 8's reorder fields
      — min/max/reorder level, reorder qty, safety stock, lead time — built
      in now instead of retrofitted later), Batch (branch-scoped, with
      reservedQuantity/availableQuantity for Phase 8's "reserved vs
      available" requirement), StockTransaction (immutable movement ledger).
      `stockService.applyStockMovement()` is now the single choke point for
      all quantity changes — every future module (purchase, sale, returns,
      transfers, stock count) must call it instead of writing `Batch.quantity`
      directly, so the audit trail can never drift from real stock.
      31 files total, all pass `node --check`.
- [x] **Stage 3 — Purchasing**: Supplier, Purchase, PurchaseItem, PurchaseReturn,
      SupplierLedger (org/branch-scoped, ported from Phase 3's well-designed
      decimal-safe money.js + gstCalculationService — reused as-is, they were
      already correct). Purchase creation is one Mongo transaction: validates
      supplier + duplicate invoice check, calculates GST per line
      (CGST+SGST vs IGST based on state code match), upserts Batch, writes a
      StockTransaction row, snapshots a PurchaseItem, and posts to
      SupplierLedger — all or nothing. Purchase Return reverses proportionally
      against the original PurchaseItem snapshot, checks returnable quantity
      and current batch stock, and credits the ledger. 45 files, all pass
      `node --check`.
- [x] **Stage 4 — Sales/POS**: Customer, Payment (generic IN/OUT ledger,
      reused for sale receipts, return refunds, and future purchase
      payments), Sale/SaleItem (FEFO auto-allocation across batches, or
      explicit batch override), HoldBill (never touches stock — holding is
      not a reservation), SalesReturn/SalesReturnItem (per-disposition:
      RESTOCK adds stock back, DAMAGED/EXPIRED/NON_RESTOCKABLE refund
      without restocking, both still logged as StockTransaction rows so
      shrinkage stays visible). saleCalculationService adapted from Phase
      4's gstCalculator (bill-discount proportional allocation, tax-inclusive
      vs exclusive pricing) onto money.js. Sale totals are ALWAYS
      recalculated server-side from live Medicine/Batch data — cart totals
      from the frontend are never trusted. Idempotency key prevents
      double-submission from double-clicks. `cancelSale` reverses stock for
      same-session corrections; SalesReturn is the separate later-date
      return flow. 61 files, all pass `node --check`.
      **Open item**: `Sale.status` transition to fully-vs-partially-returned
      is approximate right now (always sets PARTIALLY_RETURNED on any
      return) — an exact check needs summing all SalesReturnItems against
      original SaleItem quantities, which Stage 9 (analytics) will compute
      properly rather than duplicating here.
- [x] **Stage 5 — Clinic**: Doctor, Patient, Appointment (with doctor
      double-booking overlap protection), Consultation, Prescription
      (embedded items with per-item quantityDispensed tracking), Notification
      (in-app; type enum pre-extended with Phase 8's alert types so Stage 9
      reuses this delivery mechanism instead of a parallel table).
      Reconciliation: Phase 5 had a separate `Clinic` model — collapsed into
      `Branch` since they were the same "location" concept duplicated.
      Patient clinical fields are route-gated (DOCTOR/ADMIN/RECEPTIONIST
      only, never PHARMACIST/ACCOUNTANT) per Phase 8's explicit rule against
      exposing patient data to unauthorized CRM users. `dispense` only
      updates the prescription's own fulfillment tracking — it deliberately
      does NOT touch stock itself, since Sale (Stage 4) is the only path
      allowed to move inventory; the pharmacist rings up a Sale first, then
      records the dispense against the prescription for tracking. 77 files,
      all pass `node --check`.
- [x] **Stage 6 — Finance/Accounting**: ChartOfAccount + JournalEntry
      (optional double-entry foundation, balanced-entry validation, not wired
      into every transaction — SupplierLedger/Customer.outstandingBalance
      remain the primary ledgers, matching Phase 6's own framing), ExpenseCategory
      (with Phase 6's 15 default categories + a seed-defaults endpoint),
      Expense, Income (manual entries only — PHARMACY_SALE income is derived
      from Sale/Payment in Stage 9's analytics, not double-entered here),
      DayClose. `financialYear.js` computes FY from Organization's
      `financialYearStartMonth` (set in Stage 1, defaults to April).
      DayClose's `preview` endpoint computes expected cash from real
      Payment/Expense/Purchase records instead of manual entry; `closeDay`
      enforces Phase 8 section 6's rule — variance ≥ ₹200 requires a
      `varianceExplanation` before the day can close. 96 files, all pass
      `node --check`.
      **Open item**: `cashSupplierPayments` in the DayClose preview is
      hardcoded to 0 — Stage 3's Purchase controller currently only supports
      paying a supplier at the time of purchase, there's no standalone
      "pay down outstanding supplier balance" endpoint yet. Add one in
      Stage 9 if daily cash reconciliation needs it to be accurate.
- [x] **Stage 7 — WhatsApp module**: WhatsAppOrder, ported from Phase 9 but
      rewired to reference our real Medicine/Batch/Customer/Sale/User models
      directly instead of Phase 9's `tryRequire` adapter-indirection layer
      (that indirection existed only because Phase 9 was built without
      access to real Phase 1-8 code — now that real models exist, it's dead
      weight). Kept Phase 9's correct core logic: creating an order NEVER
      touches stock (checkAvailability/create are read-only), status
      transition graph rejects illegal jumps (e.g. NEW → DELIVERED) and
      terminal states can't transition further, and conversion-to-Sale goes
      through the *exact same* Batch-mutation + StockTransaction pattern as
      a POS sale (`orderConversionService.convertOrderToSale`) so a
      WhatsApp-originated sale is indistinguishable from a POS one in every
      report — added `Sale.sourceChannel`/`sourceRef` purely for
      traceability, not to branch any business logic.
      **Explicitly dropped from Phase 9**: its own Session/PasswordResetToken
      models and parallel login/logout/refresh-token auth — Stage 1 already
      established one JWT auth system for the whole merged app; running two
      auth systems side by side was exactly the kind of duplication
      MERGE_NOTES.md's stack decisions rule out. If password-reset self-serve
      is wanted, it should extend Stage 1's User/auth routes, not import
      Phase 9's separate mechanism.
      101 files, all pass `node --check`.
- [x] **Stage 9 — Phase 8 feature set**, built on the Stages 1-7 foundation:
      - **Inventory automation + smart reorder** (`/inventory-automation`):
        current/reserved/available/on-order status, and a recommendation
        engine using 30-day average daily sales × lead time + safety stock.
        **Never auto-creates a Purchase** — recommendations only, per spec.
      - **Expiry management** (`/expiry`): dashboard bucketed
        Expired/0-30/31-60/61-90/91-180 days with cost+MRP valuation,
        near-expiry report, stock valuation. Never deletes expired stock.
      - **Stock count** (`/stock-counts`): full Create → Count → Compare →
        Approve → Adjust workflow. Adjustment step routes through
        `stockService`, so it lands in the normal StockTransaction ledger.
        Approval requires ADMIN+ (a higher bar than submission), per spec's
        explicit authorization requirement.
      - **Financial controls**: DayClose already built in Stage 6 covers
        this (cash open/close/variance-explanation requirement).
      - **Payment reconciliation** (`/payment-reconciliation`): compares
        Sale.payments (expected) against actual Payment records by method,
        flags discrepancies ≥ ₹1 — never auto-corrects.
      - **Profit analytics** (`/profit-analytics`): Net Sales/COGS/Gross
        Profit/Margin/Expenses/Net Profit using `SaleItem.purchaseRateSnapshot`
        (captured at sale time in Stage 4) — deliberately never re-reads
        current Batch cost, so historical margins can't silently change.
      - **CRM analytics** (`/crm-analytics`): New/Regular/High
        Value/Inactive/Credit segments with spend/frequency/last
        purchase/outstanding/avg bill. No route into Patient data at all.
      - **Business analytics** (`/business-analytics`): KPI dashboard
        (revenue, gross/net profit, margin, avg bill, inventory
        value/turnover, outstanding, expenses) with date-range filter, plus
        branch comparison (SUPER_ADMIN only).
      - **Slow/dead/fast moving stock** (`/stock-movement`): classifies by
        sales velocity over a trailing window with a suggested action per
        item.
      - **Automated alerts + anomaly flags** (`/alerts`, `alertService.js`):
        low/critical stock, expiry risk, high outstanding, credit limit
        risk, large expense, sales drop, and pattern-level anomaly flags
        (unusual discount, repeated cancellations/adjustments, repeated
        failed logins) — all labeled "Review Required", never an accusation,
        all delivered through Stage 5's Notification model. **Never takes an
        automatic irreversible action** — advisory only.
      - **AI Business Insights** (`/ai-insights`, `aiService.js`):
        provider-agnostic, `AI_ENABLED=false` by default, core ERP has zero
        dependency on it. Structurally cannot touch clinical data — the
        controller only ever aggregates Sale/Expense/Batch figures, no code
        path to Patient/Prescription exists in it. No provider SDK actually
        wired in (no network access to add one, and faking a response would
        violate spec's own "don't fake it" instruction) — left as a
        documented integration point, returns a clear 501 rather than lying.
      - **Backup foundation** (`/backups`, `BackupLog` model): records
        status/history/metadata and a restore-authorization gate. Does NOT
        run mongodump or an actual restore itself — no scheduler
        infrastructure exists here to run one safely, and per spec section
        21's explicit instruction not to claim automated backup works
        unless actually implemented and tested, this is honestly scoped as
        a foundation for your ops process to write into, not a working
        automated backup system.
      - `.env.example` added per spec section 26.
      127 files, all pass `node --check`.
      **Open items carried forward**: `onOrder` in inventory status is
      hardcoded to 0 (no open-PO tracking exists yet — Stage 3's Purchase is
      immediate-receipt only, there's no "ordered but not yet received"
      state); inventory turnover uses period-end stock value as a stand-in
      for average inventory (no period-start snapshot retained); HIGH_VALUE
      CRM threshold (₹20,000) and large-expense threshold (₹50,000) are
      fixed defaults, not yet per-org configurable.
- [x] **Stage 8 — Frontend merge**: one consistent React app
      (Vite/Tailwind/axios/react-router) in `frontend/`, replacing the 8
      divergent per-phase frontends the same way `backend/` replaced the 8
      divergent backends. `api/endpoints.js` has one function per backend
      route across all 9 stages (127 routes). Full auth flow
      (register-organization/login/logout, session persistence, active-branch
      header for SUPER_ADMIN), a shared AppShell with nav to every module, and
      working pages for Dashboard, Medicines (full create form), Sales/POS
      (cart + checkout), Purchases, Suppliers, Customers, Patients,
      Appointments, Doctors, Expenses, Day Close (preview→close with the ₹200
      variance-explanation gate), WhatsApp Orders (with convert-to-sale),
      Inventory Automation, Expiry Dashboard, Business Analytics (+ optional
      AI insight), and Alerts.
      **Honest status**: not build-tested — same no-network-access
      constraint as the backend, so `npm install`/`vite build` couldn't
      actually run. Did what verification was possible: brace-balance check
      across all 25 files, cross-checked every page's `api/endpoints` import
      against real exports, and that process caught and fixed one real bug
      (`Card` wasn't accepting a `className` prop). See `frontend/README.md`
      for exactly which pages are full CRUD vs. list-only vs. wired-in-API-
      but-no-page-yet — most modules got list views; Medicines and Sales got
      full create flows as the reference pattern for extending the rest.

## What's actually verified vs. syntax-checked
Everything above passed `node --check` (syntax only) or the frontend's
brace-balance/import-cross-reference checks — neither proves the *logic* is
correct without a live run. One category IS genuinely verified, not just
syntax-checked: **`money.js`, `gstCalculationService.js`,
`saleCalculationService.js`, and `financialYear.js` have zero database
dependencies, so real unit tests were written AND EXECUTED** with Node's
built-in test runner (no npm install needed — `node --test`, available
since Node 18). 41 tests, all passing:
- `money.test.js` (9) — decimal-safe arithmetic, including the classic
  `0.1 + 0.2 !== 0.3` float trap and 10x float-drift accumulation.
- `gstCalculationService.test.js` (12) — intra vs inter-state GST split,
  discount-before-tax ordering, free-quantity-to-stock-not-billing, and
  input validation (rejects negative/zero quantity, out-of-range GST rate,
  over-limit flat discount).
- `saleCalculationService.test.js` (16) — tax-inclusive vs exclusive
  pricing, bill-discount proportional allocation (including the
  rounding-remainder-goes-to-last-item rule, verified to sum EXACTLY to the
  bill discount with no leftover paisa), and a realistic end-to-end 2-item
  bill composing item discount + bill discount + mixed GST rates.
- `financialYear.test.js` (4) — FY boundary at the configured start month,
  both default (April) and custom.

Run with `npm test` in `backend/` — no setup required, this is the one
piece of this whole merge you can verify actually works without spinning up
MongoDB. Everything touching a database (every controller, every route)
still needs the real run described below to be trusted — these tests only
cover the pure-function core, deliberately the highest-stakes pure logic
(money/tax math) in the app.

## Security hardening pass (Phase 8 section 17-18)
A real audit, not an assumed pass — see `backend/SECURITY.md` for the full
checklist and reasoning. Found and fixed 4 real gaps: no `.gitignore`
anywhere (real risk of committing `.env`), no fail-fast startup check for
missing `JWT_SECRET`/`MONGODB_URI`, an unused cookie-auth fallback in
`authenticateUser.js` that was CSRF-exposed attack surface with no
corresponding benefit (removed it + `cookie-parser` entirely — the app is
Bearer-token-only), and no rate limit on org registration (the one endpoint
that creates data with zero auth). Also documented what's genuinely NOT
done rather than silently passing it: no password complexity policy beyond
length, no password change/reset flow, no server-side token revocation.
131 backend files, still all pass `node --check`; all 41 unit tests still
pass after these changes.

## Docker Compose — one-command run
Added `docker-compose.yml` (root), `backend/Dockerfile`, `frontend/Dockerfile`
(multi-stage, served via `serve`), and a top-level `README.md` tying the
whole project together as a single entry point. This directly targets the
one real blocker repeated throughout this log: actually running the thing.
`docker compose up --build` needs nothing installed on the host beyond
Docker itself — no local npm/Node/MongoDB. One real bug caught while
building this: the built frontend has no Vite dev-proxy (that only exists
in `vite dev`), so `api/client.js` was fixed to read `VITE_API_BASE_URL`
(baked in at Docker build time) with the original relative `/api` path kept
as the dev-server default — a container serving the static build with the
old hardcoded `/api` would have silently failed every request.
Re-verified after these changes: 131 backend files still `node --check`
clean, all 41 tests still pass, 37 frontend files still brace-balanced.

## Where things stand
Both merge phases (backend Stages 1-9, frontend Stage 8) are complete, and
the frontend page list is now exhaustive — every backend endpoint built
across Stages 1-9 has a working page calling it: 37 files total. Final
additions this pass: Purchase Returns, Sales Returns, Hold Bills, Accounting
(Chart of Accounts + Journal Entries combined, since they're used together),
and Consultations (start from a checked-in appointment → clinical notes →
issue prescription, closing the clinic workflow end-to-end).
Verification: brace-balance check across all 37 files, cross-checked every
page's `api/endpoints` import against real exports, and confirmed every
AppShell nav link resolves to an actual App.jsx route — all clean.

The original ask — build Phase 8 on the existing codebase — is done, on a
codebase that's now actually real and integrated, not 8 disconnected
snapshots, with a frontend that exercises the entire surface. What's not
done, and can't be from here: an actual `npm install` + `npm run build` +
live MongoDB run, since this sandbox has no network access. That is the
genuinely necessary next step before deploying any of this — not more
code-writing.

## What's verified vs. not (be honest about this every stage)
- Verified: every file is syntactically valid JS (`node --check`).
- Verified: route files require only modules that exist in this repo.
- NOT verified: behavior against a live MongoDB (no network access to npm
  registry or a Mongo server in this environment). You'll need to `npm
  install` and run this against real MongoDB on your machine/CI to confirm
  it actually boots and the auth flow works end-to-end.

## Known open decisions for later stages
- Phase 4's `Sale`/`Payment` vs Phase 6's `Invoice`/`Sale` — planning to take
  Phase 6's as canonical (GST/accounting-integrated) and fold Phase 4's
  discount/hold-bill logic into it. Will confirm before Stage 4.
- Phase 2/3/6 each redefine `Medicine`/`Batch` slightly differently — Stage 2
  will reconcile field-by-field and flag anything Phase 6's finance module
  depends on that the others don't have.
