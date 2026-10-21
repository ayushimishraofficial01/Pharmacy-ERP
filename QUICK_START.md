# Quick Start - Pharmacy ERP Phase 11

## Environment Setup ✓
- `.env` file created with JWT_SECRET

## To Run (After Docker Installation):
```powershell
cd c:\Users\rahul\OneDrive\Desktop\pharmacy-erp-phase11\merged
docker compose up --build
```

Then open: http://localhost:5173

## Services Started:
- **MongoDB** (localhost:27017)
- **Backend API** (http://localhost:5000)
- **Frontend** (http://localhost:5173)

## First Steps:
1. Use the Register page to create your first organization
2. Login and explore the pharmacy management features

## Stopping the Project:
```
docker compose down
```

## Documentation:
- Read MERGE_NOTES.md for the full story
- API_REFERENCE.md in backend/ for all routes
- SECURITY.md in backend/ for security audit

---

Once Docker is installed, come back and I'll start the services for you!
