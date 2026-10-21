# Pharmacy ERP — Merged

A single, real, integrated codebase built by merging 7 independently-built
"phase" prototypes plus a Phase 8 feature set, after discovering they were
never actually connected to each other. Full story, every decision, and
every honestly-flagged gap: **[`MERGE_NOTES.md`](./MERGE_NOTES.md)** — read
that first.

## Run it (fastest path — Docker)
```
cp .env.example .env       # fill in JWT_SECRET: any random 32+ char string
docker compose up --build
```
Then open http://localhost:5173 and use the Register page to create your
first organization. No local Node/npm/MongoDB install needed — everything
runs in containers.

## Run it (without Docker)
```
# Terminal 1
cd backend
npm install
cp .env.example .env       # fill in MONGODB_URI (a real local/Atlas Mongo) and JWT_SECRET
npm run dev

# Terminal 2
cd frontend
npm install
npm run dev
```
Open http://localhost:5173.

## Verify the core math without running anything else
```
cd backend
npm test
```
41 unit tests covering the money/GST/discount calculation logic — the one
part of this merge verified by actual execution, not just a syntax check.
See `MERGE_NOTES.md`'s "What's actually verified vs. syntax-checked"
section for exactly what that does and doesn't cover.

## What's in here
- **`backend/`** — Express + MongoDB API, 131 files. See
  `backend/API_REFERENCE.md` for every route, `backend/SECURITY.md` for a
  real security audit against the original Phase 8 spec's own checklist.
- **`frontend/`** — React + Vite + Tailwind, 37 files, one page per backend
  module. See `frontend/README.md`.
- **`docker-compose.yml`** — MongoDB + backend + frontend, one command.

## Honest status
Built and internally consistent; **not build-tested against a live
MongoDB** (no network access in the environment this was built in). Read
`MERGE_NOTES.md`'s stage-by-stage log for exactly what's been verified vs.
what's syntax-checked-only vs. what's an explicitly flagged open item — the
intent throughout was to never claim something works without saying how it
was actually checked.
