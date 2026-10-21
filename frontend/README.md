# Merged Pharmacy ERP Frontend

One consistent React app (Vite + Tailwind + axios + react-router), replacing
the 8 divergent per-phase frontends the same way `backend/` replaced the 8
divergent backends — see `../MERGE_NOTES.md` for why.

## Run
```
npm install
npm run dev
```
Expects the merged backend running on `http://localhost:5000` (see
`vite.config.js`'s proxy). Update `VITE`-side config if that changes.

## What's here
- `src/api/client.js` + `src/api/endpoints.js` — one function per backend
  route across all 9 merge stages (mirrors `backend/API_REFERENCE.md`
  exactly). Any new backend route should get a matching entry here.
- `src/context/AuthContext.jsx` — login/register/logout, session persistence,
  active-branch header for SUPER_ADMIN.
- `src/layouts/AppShell.jsx` — sidebar nav + top bar, wraps every
  authenticated page.
- `src/components/ui.jsx` — shared primitives (Card, Table, Button,
  StatCard, ErrorBanner) every page is built from, so styling stays
  consistent without a component library dependency.
- `src/pages/` — one file per screen.

## Honest status
**Not build-tested.** This sandbox has no network access to `npm install`
the dependencies or run a real Vite build/dev server, the same limitation
noted for the backend in `MERGE_NOTES.md`. Every file passed a manual
review (brace-balance check across all 25 files, cross-checked every
`api/endpoints` import against its actual export, fixed one prop-passing
bug found this way — `Card` wasn't accepting `className` until corrected).
That is real verification, but it is not the same as `npm run build`
succeeding — run that locally before deploying.

**Page coverage**: every nav item routes to a working page that calls a
real backend endpoint and renders real data. Given the size of the backend
(127 routes), most pages are functional list/read views rather than full
CRUD forms for every field — Medicines and Sales got fuller create flows
as the representative pattern; Suppliers/Customers/Patients/Doctors/
Appointments/Expenses are list-only right now (no create/edit form yet).
Extending any of them to a full form follows the exact pattern in
`Medicines.jsx`. Purchases, Purchase Returns, Sales Returns, Hold Bills,
Consultations, Prescriptions, Stock Count, Payment Reconciliation, Profit
Analytics, CRM Analytics, Stock Movement (slow/dead/fast), Chart of
Accounts, and Backups have working `api/endpoints.js` methods but no page
yet — add one when needed, following the same pattern.
