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
# Optional second national owner
OWNER_SEED_EMAIL_2="co-owner@your-apex-platform.example"
OWNER_SEED_PASSWORD_2="your-strong-second-owner-password"
OWNER_SEED_NAME_2="Co-Owner"
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
- **Phase 6 fortress (complete):** RLS + fail-closed `writeAuditedAccess` + session revocation — see [Security-Fortress.md](./Security-Fortress.md)

---

## Verification

```bash
npm run typecheck
npm test
npm run test:integration
npm run smoke:dealer-provision -- --dry-run-db
npm run validate:pre-rollout
```

Integration coverage:

- `tests/integration/apex-owner-flows.test.ts`
- `tests/integration/security-fortress.test.ts`
- `tests/integration/dealer-provision.test.ts` (CLI core + HTTP + forced password)

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

---

## Phase 6.1 — RLS foundation + mandatory auditing

| Piece | Location |
|-------|----------|
| RLS ENABLE + FORCE policies | `prisma/migrations/20250712120000_apex_phase6_1_rls_foundation/` |
| Transaction-local session vars | `src/lib/apex/rlsContext.ts` (`setRlsContext`, `withRlsContext`, `withRlsBypass`) |
| Fail-closed access audit | `src/lib/auditedAccess.ts` (`writeAuditedAccess`) |
| Owner least-privilege | `tenantScope.ts` + `apiRoute` admin/manager guards |

```env
# Optional defense-in-depth — policies soft-open when enforced is off
RLS_ENABLED="true"
```

Sensitive routes (owner enter/exit/summary, RO create) call `writeAuditedAccess` — audit failure aborts the operation.

### Phase 6.2 — enforcement expansion

| Piece | Behavior |
|-------|----------|
| `withSessionRls` | Default wrap for `requireDealershipContext` / `requireAuditedAccess` routes |
| `getRlsDb()` | ALS-bound transaction client for RepairOrder / AuditLog queries |
| `rlsTransaction()` | Reuses ambient RLS tx (no nested non-RLS connections) |
| `writeAuditedAccess` | RO read/update/delete, audit log access, password change, logout, user deactivate/delete |
| `revokeAllSessionsForTechnician` | sessionVersion + apex refresh + Clerk |
| Scope switch | Enter/exit dealership revokes prior apex refresh families |

### Phase 6.3 — expanded enforcement

| Piece | Behavior |
|-------|----------|
| `requireOwnerNational` | National console (summary, dealership list) blocked while in rooftop scope |
| Select-dealership | `writeAuditedAccess` + refresh-family revoke before re-issue |
| Upload / sold metrics / PDF export / extract | Fail-closed `writeAuditedAccess` |
| Customer Pay apply/clear | RLS transaction + fail-closed clear audit |
| Admin password reset | `revokeSessionsAfterCredentialChange` (JWT + refresh + Clerk) |
| Integration | `tests/integration/security-fortress.test.ts` |

### Phase 6.4 — finalize Security Fortress

| Piece | Behavior |
|-------|----------|
| Advisors / templates / technicians / knowledge-base | `getRlsDb` + dealership context; mutations fail-closed audited |
| Login / refresh / Clerk link | `writeAuditedAccess` |
| Enter dealership | `requireOwnerNational` (must exit rooftop before re-enter) |
| Docs | `docs/Security-Fortress.md` + pre-rollout Phase 6 complete gate |

**Phase 6.0 status: complete.**

---

## Dealer onboarding (multi-rooftop provision)

**Full runbook:** [Apex-Dealer-Onboarding.md](./Apex-Dealer-Onboarding.md)

Secure CLI provision creates a **Dealer** (franchise) + **Dealership** (rooftop UI name) + **service manager** with:

| Control | Behavior |
|---------|----------|
| Password delivery | Never on argv — env / stdin / interactive / generate |
| Display name | `--rooftop-name` → `Dealership.name` (full storefront string) |
| First login | `mustChangePassword` blocks PII until change-password |
| Audit | `dealer.provision` metadata is PII-free (hashed code + ids) |
| Templates | `mercedes-rooftop-v1` (D7) · `generic-rooftop-v1` (apex username) |

```bash
npm run provision-dealer -- \
  --code=NEWPORT \
  --dealer-name="Mercedes-Benz of Newport Group" \
  --rooftop-name="Mercedes-Benz of Newport" \
  --template=mercedes-rooftop-v1 \
  --manager-name="…" \
  --manager-email=… \
  --manager-d7=D7… \
  --manager-password-env=NEWPORT_MANAGER_PASSWORD
```

After provision, the manager signs into Apex, completes the **forced password change** screen, then re-authenticates into the rooftop workspace. National owners see the new rooftop under the full storefront name and enter dealership for scoped PII.

### Optional HTTP provision

```env
APEX_ALLOW_HTTP_PROVISION=true
```

`POST /api/owner/provision-dealer` — same `provisionDealer()` core as the CLI, owner **national** scope only, rate-limited, confirm-code required, password never returned. Disabled unless the env flag is exactly `true`.

Smoke tests, env vars, deny-lists, and troubleshooting are documented in the onboarding guide.