# API Reference — Merged Pharmacy ERP Backend

All routes are prefixed `/api`. Every route except `POST /auth/register-organization`
and `POST /auth/login` requires `Authorization: Bearer <token>`. Routes marked
🏢 also require an `X-Branch-Id` header if the caller is `SUPER_ADMIN` (other
roles are already pinned to their own branch — see `authenticateUser.js`).

| Method | Path | Roles | Notes |
|---|---|---|---|
| **Auth** |
| POST | `/auth/register-organization` | public | Creates Org + first Branch + SUPER_ADMIN user |
| POST | `/auth/login` | public | Rate-limited (20/15min), account lockout after 5 failed attempts |
| POST | `/auth/logout` | any | |
| GET | `/auth/me` | any | |
| **Catalog** |
| GET/POST/PUT/DELETE | `/categories` | write: ADMIN+/PHARMACIST | DELETE = soft deactivate |
| GET/POST/PUT/DELETE | `/manufacturers` | write: ADMIN+/PHARMACIST | DELETE = soft deactivate |
| GET/POST/PUT/DELETE | `/medicines` | write: ADMIN+/PHARMACIST | `GET /:id` includes live stock summary if branch context present |
| **Inventory** 🏢 |
| GET | `/batches/medicine/:medicineId` | any | Sorted oldest-expiry-first |
| POST | `/batches/adjust` | ADMIN+/PHARMACIST | Manual stock adjustment (OPENING_STOCK/ADJUSTMENT/DAMAGE/EXPIRED/STOCK_COUNT_CORRECTION only) |
| **Purchasing** 🏢 |
| GET/POST/PUT/DELETE | `/suppliers` | write: ADMIN+/PHARMACIST/ACCOUNTANT | |
| GET, GET/:id, POST | `/purchases` | write: ADMIN+/PHARMACIST | Transactional: GST calc, batch upsert, stock+, supplier ledger |
| GET, POST | `/purchase-returns` | write: ADMIN+/PHARMACIST | Proportional reversal against original PurchaseItem |
| **Sales/POS** 🏢 |
| GET/POST/PUT | `/customers` | any authenticated | |
| GET, GET/:id, POST, POST/:id/cancel | `/sales` | write: ADMIN+/PHARMACIST; cancel: ADMIN+ | FEFO allocation, idempotency key, live server-side recalc |
| GET, POST | `/sales-returns` | write: ADMIN+/PHARMACIST | Per-item disposition (RESTOCK/DAMAGED/EXPIRED/NON_RESTOCKABLE) |
| GET, POST, GET/:id/resume, DELETE | `/hold-bills` | any | Never touches stock |
| **Clinic** |
| GET/POST/PUT | `/doctors` | write: ADMIN+/BRANCH_MANAGER | |
| GET, GET/:id, POST, PUT | `/patients` | ADMIN/DOCTOR/RECEPTIONIST only | Clinical fields gated — PHARMACIST/ACCOUNTANT excluded |
| GET, POST, PATCH/:id/status | `/appointments` 🏢 | any | Doctor double-booking overlap check on create |
| POST, GET/:id, PUT/:id | `/consultations` 🏢 | ADMIN/DOCTOR only | |
| POST, GET/patient/:id, GET/:id, PATCH/:id/dispense | `/prescriptions` 🏢 | create/access: DOCTOR; dispense: PHARMACIST | Dispense tracks fulfillment only, doesn't touch stock |
| **Finance** |
| GET/POST | `/chart-of-accounts` | ADMIN/ACCOUNTANT | |
| GET/POST | `/journal-entries` 🏢 | ADMIN/ACCOUNTANT | Rejects unbalanced entries |
| GET/POST/PUT/DELETE, POST `/seed-defaults` | `/expense-categories` | write: ADMIN/ACCOUNTANT | |
| GET/POST, PATCH/:id/cancel | `/expenses` 🏢 | write: ADMIN+/ACCOUNTANT | Flags LARGE_EXPENSE_RECORDED ≥ ₹50k |
| GET/POST, PATCH/:id/cancel | `/income` 🏢 | write: ADMIN+/ACCOUNTANT | Manual (non-Sale) income only |
| GET `/preview`, GET, POST | `/day-close` 🏢 | ADMIN+/ACCOUNTANT | Preview computes expected cash from real Payment/Expense/Purchase data; variance ≥ ₹200 requires explanation |
| **WhatsApp** 🏢 |
| GET | `/whatsapp/availability` | any | Read-only stock check, never reserves |
| GET, GET/:id, POST | `/whatsapp/orders` | any | Creating an order never touches stock |
| PATCH `/:id/status` | `/whatsapp/orders` | ADMIN+/PHARMACIST/RECEPTIONIST | Enforces status transition graph |
| PATCH `/:id/confirm-item` | `/whatsapp/orders` | ADMIN+/PHARMACIST | Assigns a real batch to an order item |
| POST `/:id/convert` | `/whatsapp/orders` | ADMIN+/PHARMACIST | The only WhatsApp endpoint that moves stock — creates a real Sale |

## Conventions
- Every list/create endpoint scopes to `req.organizationId` (+ `req.branchId`
  where the model is branch-scoped) automatically via `authenticateUser` —
  callers never pass these explicitly.
- Every response is `{ success, message, data }` on success or
  `{ success: false, message, errors }` on failure (`apiResponse.js`).
- Money fields are always rupees as JS numbers, paisa-rounded via `money.js`
  — never do float arithmetic on them client-side and re-send; treat server
  totals as authoritative (this is enforced server-side in Sale/Purchase too).
