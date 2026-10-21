# Copilot Instructions

## Project layout and commands

This project has two independent npm packages; run commands from the relevant directory. The root README and `backend/API_REFERENCE.md` are the main setup and endpoint references.

### Backend (`backend/`)

- `npm run dev` starts the API with nodemon; `npm start` starts it normally.
- `npm test` runs the built-in Node test suite.
- Run one test file with `node --test src/tests/money.test.js`; filter tests with `node --test --test-name-pattern="sum adds" src/tests/money.test.js`.
- MongoDB is needed for the API. See the root `.env.example` for environment configuration.

### Frontend (`frontend/`)

- `npm run dev` starts Vite at `http://localhost:5173`; its `/api` proxy targets the backend at `http://localhost:5000`.
- `npm run build` creates the production build; `npm run preview` serves that build locally.
- `VITE_API_BASE_URL` configures the API URL for production builds.

From the project root, `docker compose up --build` starts the frontend, backend, and MongoDB together. Neither package defines a lint script.

## Architecture

- The backend is an Express + Mongoose API. `backend/src/server.js` validates required environment variables and connects to MongoDB before listening; `backend/src/app.js` configures middleware and mounts resource routers under `/api`.
- Backend routes apply authentication, branch requirements, and role authorization; controllers handle HTTP input/output, while reusable business workflows and calculations live in services. Models define persistence and indexes. Successful and failed API responses use the `{ success, message, data }` / `{ success: false, message, errors }` envelope via `apiResponse.js`.
- Data is multi-tenant: business records are scoped by `organizationId` and, when location-specific, `branchId`. `authenticateUser` supplies these request values; branch-specific operations require a branch context, including an `X-Branch-Id` selection for a `SUPER_ADMIN`. Preserve tenant and branch filters in new reads and writes.
- Inventory quantities have an audit ledger. Route stock-changing flows through `services/stockService.js` so batch changes and `StockTransaction` records stay consistent. Sales and purchases use MongoDB transactions for related writes. Money/GST calculations use shared pure helpers such as `utils/money.js`; keep rupee arithmetic paisa-safe and treat server-calculated sale totals as authoritative.
- Online POS and offline sync share `services/saleCreationService.js`; do not introduce a second sale/billing path. The frontend stores offline catalog data and pending sales in IndexedDB and only clears an outbox sale after the server confirms sync.
- The frontend is a React SPA: `src/App.jsx` declares routes, `AuthContext` manages session state, and `AppShell` wraps authenticated pages. Pages call backend endpoints through `src/api/endpoints.js` and the shared Axios client in `src/api/client.js`; keep those endpoint functions aligned with backend routes and `backend/API_REFERENCE.md`.

## Codebase-specific conventions

- Backend files use CommonJS (`require` / `module.exports`); frontend files use ES modules and JSX.
- Use `sendSuccess` / `sendError` for backend response envelopes, and keep authorization on the route where the operation is declared.
- Keep stock, tax, billing, and ledger behavior in shared services rather than duplicating it in controllers or frontend pages. Use `stockService` for inventory movements and the existing money/GST helpers for financial calculations.
- Frontend API functions generally use `unwrap` to return the response `data` payload; preserve the shared client’s bearer-token and active-branch headers.
- Backend tests use Node’s built-in `node:test` runner and currently focus on pure calculations and helpers. `MERGE_NOTES.md` distinguishes those executed tests from database-backed behavior that still needs runtime verification; don’t treat a passing unit suite as integration coverage.
