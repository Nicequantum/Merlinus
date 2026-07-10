# Security Fortress (Phase 6.0)

**Status:** Complete (PR-6.1 → PR-6.4)  
**Audience:** Platform security, compliance, and operators  
**Default product mode:** Merlinus single-dealer remains the safe default; Apex enables multi-rooftop fortress controls.

---

## Goals

1. **Defense-in-depth tenancy** — Postgres RLS on PII tables, set per transaction via `app.*` session vars  
2. **Fail-closed compliance audits** — sensitive reads/writes must produce durable `AuditLog` rows  
3. **Owner least-privilege** — national owners cannot see dealership PII until enter-dealership  
4. **Session kill-switch** — credential change / logout / admin actions revoke JWT + apex refresh + Clerk  

---

## Architecture

```
┌──────────────────┐     withAuth      ┌─────────────────────┐
│  API route       │ ───────────────►  │ requireDealership / │
│  (PII / owner)   │                   │ requireOwnerNational│
└────────┬─────────┘                   └──────────┬──────────┘
         │                                        │
         │ withSessionRls (default)               │
         ▼                                        ▼
┌──────────────────┐                   ┌─────────────────────┐
│ set_config LOCAL │                   │ writeAuditedAccess  │
│ app.rls_enforced │                   │ (fail-closed)       │
│ app.scope_mode   │                   └─────────────────────┘
│ app.active_…_id  │
└────────┬─────────┘
         │ getRlsDb() / rlsTransaction()
         ▼
┌──────────────────┐
│ Postgres FORCE   │
│ RLS policies     │
└──────────────────┘
```

### Key modules

| Module | Role |
|--------|------|
| [`src/lib/apex/rlsContext.ts`](../src/lib/apex/rlsContext.ts) | `withSessionRls`, `getRlsDb`, `rlsTransaction`, `setRlsContext` |
| [`src/lib/auditedAccess.ts`](../src/lib/auditedAccess.ts) | Fail-closed `writeAuditedAccess` |
| [`src/lib/apex/tenantScope.ts`](../src/lib/apex/tenantScope.ts) | Dealership / national owner guards |
| [`src/lib/sessionRevocation.ts`](../src/lib/sessionRevocation.ts) | Full session kill + scope-switch refresh drop |
| [`prisma/migrations/20250712120000_apex_phase6_1_rls_foundation/`](../prisma/migrations/20250712120000_apex_phase6_1_rls_foundation/) | ENABLE + FORCE RLS policies |

### Soft-open vs enforced

- Policies allow access when `app.rls_enforced` is not `on` (Merlinus / gradual rollout).  
- PII routes set `enforced: true` inside `withSessionRls` / `rlsTransaction`.  
- Optional env: `RLS_ENABLED=true` also defaults generic helpers to enforced.

---

## Owner session model

| State | Allowed | Denied |
|-------|---------|--------|
| **National** | `/api/owner/*`, enter-dealership | RO/PII routes (`DEALERSHIP_CONTEXT_REQUIRED`) |
| **Dealership** | PII routes for active rooftop | National summary / dealership list / re-enter without exit |

- Sentinel `__apex_national__` is never an enterable rooftop.  
- Enter / exit / multi-rooftop select revoke prior apex refresh families before re-issue.

---

## Mandatory audit surfaces (non-exhaustive)

| Area | Actions (examples) |
|------|--------------------|
| Auth | `auth.login`, `auth.logout`, `auth.refresh`, `auth.select_dealership`, `auth.password_change`, `auth.clerk_link` |
| Owner | `owner.national_access`, `owner.dealership_enter`, `owner.dealership_exit` |
| RO / story | `ro.create`, `ro.read`, `ro.update`, `ro.delete`, `ro.extract`, `story.*` |
| Compliance | `audit.access`, `image.upload`, `story.pdf_export` |
| Admin | `user.*`, `advisor.*`, `template.save` / `template.use` |

---

## Session revocation matrix

| Event | sessionVersion | Apex refresh | Clerk |
|-------|----------------|--------------|-------|
| Logout | yes | yes | active + linked |
| Password change (self) | yes | yes | linked |
| Admin password reset | yes | yes | linked |
| User deactivate / delete | yes | yes | linked |
| Owner enter / exit | — | yes (scope switch) | — |
| Multi-rooftop select | — | yes (scope switch) | — |

---

## Verification

```bash
npm run typecheck
npm test
npm run test:integration
npm run validate:pre-rollout
```

Security-focused suite: `tests/integration/security-fortress.test.ts`  
Unit guards: `tests/unit/phase63Security.test.ts`, `tests/unit/rlsEnforcement.test.ts`

---

## Phase 6 PR checklist

| PR | Deliverable |
|----|-------------|
| 6.1 | RLS migration + `rlsContext` + `writeAuditedAccess` foundation |
| 6.2 | Default `withSessionRls` for PII routes; core path auditing |
| 6.3 | Remaining PII coverage; national owner console lock; fortress IT suite |
| 6.4 | Advisors/templates/technicians/auth edges; docs; pre-rollout complete gate |

**Phase 6.0 status: complete.**
