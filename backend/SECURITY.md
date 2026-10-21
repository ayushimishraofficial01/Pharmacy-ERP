# Security Audit — Phase 8 Sections 17-18

An actual read-through of the code against the checklist in the original
Phase 8 spec, not an assumed pass. Findings below; anything not listed was
checked and is already in place from earlier stages.

## Findings fixed in this pass
1. **No `.gitignore`** — `.env` (with `MONGODB_URI`, `JWT_SECRET`, etc.)
   could have been committed. Added to both `backend/` and `frontend/`.
2. **No fail-fast startup check** — the server would boot successfully with
   a missing `JWT_SECRET` and only fail on the first login attempt.
   `config/assertEnv.js` now exits with a clear message before the server
   starts if `MONGODB_URI`/`JWT_SECRET` are missing, and warns if
   `JWT_SECRET` looks too short.
3. **Unused cookie-auth fallback with no CSRF protection** —
   `authenticateUser.js` accepted a token from `req.cookies.token` as well
   as the Authorization header. Nothing in this app ever sets that cookie
   (the frontend uses localStorage + Bearer header exclusively), so it was
   unused attack surface: if anyone had started setting an auth cookie
   later without also adding CSRF protection (double-submit token,
   SameSite=strict, etc.), it would have been exploitable. Removed the
   fallback, removed `cookie-parser` entirely, and set `cors({credentials:
   false})` since nothing depends on cross-origin cookies anymore.
4. **Org registration had no rate limit** — `/auth/register-organization`
   is the one endpoint that creates data with zero authentication. Only
   `/auth/login` had a rate limiter. Added a separate, tighter one (5/hour)
   since this endpoint can otherwise be used to spam-create organizations
   or enumerate registered emails via the duplicate-key error.

## Checklist status (section 17: Security Hardening)
| Item | Status |
|---|---|
| Helmet | ✅ `app.use(helmet())` |
| CORS | ✅ Locked to `FRONTEND_URL`, `credentials: false` |
| Rate Limiting | ✅ Global (500/15min) + login (20/15min) + registration (5/hour) |
| Input Validation | ⚠️ Partial — see "Open items" below |
| Secure Authentication | ✅ JWT, bcrypt, Bearer-only (no cookie fallback) |
| Authorization | ✅ Role-based (`authorizeRoles`) on every write route |
| Password Hashing | ✅ bcrypt, cost factor 10, in `User.pre('save')` |
| Token Expiration | ✅ 8h default (`JWT_EXPIRES_IN`) |
| Branch Isolation | ✅ Every branch-scoped query filters by `req.branchId` |
| Organization Isolation | ✅ Every query filters by `req.organizationId` |
| Audit Logging | ✅ `auditLogService` — one system, every module uses it |

## Checklist status (section 18: Password Security)
| Item | Status |
|---|---|
| Strong Password Policy | ⚠️ Only a minlength(6) on `User.password`. No complexity requirement (upper/lower/digit/symbol). |
| Password Change | ❌ Not implemented — no "change my password" route exists yet |
| Secure Password Reset | ❌ Not implemented — Phase 9's Session/PasswordResetToken models were explicitly dropped in Stage 7 (would have meant two auth systems); a real reset flow needs to be built fresh against Stage 1's User model |
| Failed Login Tracking | ✅ `User.failedLoginAttempts`, checked in `login()` |
| Account Lock/Protection | ✅ Locks for 15 min after 5 failed attempts |
| Session Expiration | ✅ JWT expiry (see above) — no server-side revocation list, so a stolen token remains valid until it expires; that's a real gap for a "log out everywhere" or "revoke compromised token" scenario |

## Open items (not fixed — flagged honestly rather than silently left)
- **No input validation library** (Joi/Zod/express-validator). Every
  controller does manual `if (!field) return sendError(...)` checks for
  presence, and Mongoose schema validation catches type/enum errors, but
  there's no systematic sanitization (e.g. stripping unexpected fields from
  request bodies before they hit `Model.create({...req.body, ...})`).
  Concretely: `req.body` is spread directly into several `create()` calls
  (e.g. `medicineController.create`, `customerController.create`) — a
  client could pass extra fields that happen to match schema paths (like
  trying to set `isActive: true` on creation, which is already the
  default and harmless, but the pattern itself isn't defended). None of
  the sensitive fields (organizationId, passwords, balances) are
  spreadable this way since those are always set explicitly after the
  spread, but this is worth tightening with a validation layer before
  production use.
- **No password complexity requirement** beyond length ≥ 6.
- **No password change or reset flow** — added as an open item, not
  fabricated to look done.
- **No server-side token revocation** — logout is client-side-only (the
  token remains technically valid until it expires). A real "log out
  everywhere" needs either short-lived tokens + refresh tokens, or a
  server-side denylist.
- **No CSRF protection** — not currently needed (Bearer-token-only auth
  isn't CSRF-vulnerable the way cookie auth is), but flagged so it isn't
  forgotten if cookie-based auth is ever added later.
