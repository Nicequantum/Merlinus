# Apex National Platform — Phase 5 Operations Guide

**Audience:** Platform operators and deployment engineers  
**Merlinus default:** `PLATFORM_MODE=merlinus` (or unset) — Tiverton single-dealer experience unchanged

---

## Platform modes

| Mode | Env | Login | Session |
|------|-----|-------|---------|
| **Merlinus** (default) | unset or `merlinus` | D7 + password | `benz_tech_session` (8h JWT) |
| **Apex** | `PLATFORM_MODE=apex` | Email / D7 / apex username | `apex_access` + `apex_refresh` |

Set client mirror for UI branching:

```env
PLATFORM_MODE=apex
NEXT_PUBLIC_PLATFORM_MODE=apex
```

Local dev: `npm run dev:apex` loads `.env.apex.local`.

---

## Owner accounts

Owners authenticate with **email** and land in **national scope** — aggregate visibility only, no customer PII until they explicitly enter a dealership.

### Seed an owner (development / staging)

Add to `.env.local` or `.env.apex.local`:

```env
OWNER_SEED_EMAIL="owner@your-apex-platform.example"
OWNER_SEED_PASSWORD="your-strong-owner-seed-password"
OWNER_SEED_NAME="National Owner"
```

Run:

```bash
npm run db:seed
```

Optional multi-rooftop demo account (apex username, two dealership memberships):

```env
MULTI_ROOFTOP_SEED_USERNAME="mercedes.alex.technician"
MULTI_ROOFTOP_SEED_PASSWORD="your-strong-multi-rooftop-password"
```

---

## Owner session flow

1. **Login** → `scopeMode: national` → National Operations dashboard
2. **Enter dealership** → audited `owner.dealership_enter` → dealership PII access
3. **Exit to national** → audited `owner.dealership_exit` → returns to aggregates-only console

National summary API: `GET /api/owner/summary` (owner-gated, apex-only, no PII in response).

---

## Security model

- PII routes use `requireDealershipContext` — national owners receive `403` with `DEALERSHIP_CONTEXT_REQUIRED`
- Owner FK uses sentinel dealership `__apex_national__`
- All owner context switches are audited (`owner.dealership_enter`, `owner.dealership_exit`, `owner.national_access`)

---

## Verification

```bash
npm run typecheck
npm test
npm run test:integration
npm run validate:pre-rollout
```

Integration coverage: `tests/integration/apex-owner-flows.test.ts`

---

## Phase 5 checklist (complete)

| PR | Capability |
|----|------------|
| 5.1 | Fortress schema, sentinel dealership, refresh tokens |
| 5.2 | TechnicianDealership memberships |
| 5.3 | Unified login (email / D7 / username) |
| 5.4 | Dual-token apex sessions |
| 5.5 | Owner least-privilege scoping |
| 5.6 | Apex UI foundation |
| 5.8 | Dealership selector UX |
| 5.9 | Owner national console |
| 5.10 | Owner seed accounts, integration tests, docs |