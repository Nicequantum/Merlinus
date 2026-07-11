# Security Fortress (Phase 6.0) + Hardening Sprint (6.1–6.4)

**Status:** **Complete** — Security Fortress (Phase 6.0) + Security Hardening Sprint (Phases 6.1–6.4)  
**Audience:** Platform security, compliance, enterprise buyers, and operators  
**Default product mode:** Merlinus single-dealer remains the safe default; Apex enables multi-rooftop fortress controls.

---

## Goals

1. **Defense-in-depth tenancy** — Postgres RLS on PII tables, set per transaction via `app.*` session vars  
2. **Fail-closed compliance audits** — sensitive reads/writes must produce durable `AuditLog` rows  
3. **Owner least-privilege** — national owners cannot see dealership PII until enter-dealership  
4. **Session kill-switch** — credential change / logout / admin actions revoke JWT + apex refresh + Clerk  
5. **Enterprise credential hygiene** — no hard-coded owner secrets; create-only seed; explicit platform operators  

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
│ app.rls_soft_open│                   └─────────────────────┘
│ app.scope_mode   │
│ app.active_…_id  │
└────────┬─────────┘
         │ getRlsDb() / rlsTransaction() / withRlsBypass()
         ▼
┌──────────────────┐
│ Postgres FORCE   │
│ RLS policies     │
└──────────────────┘
```

### Key modules

| Module | Role |
|--------|------|
| [`src/lib/apex/rlsContext.ts`](../src/lib/apex/rlsContext.ts) | `withSessionRls`, `getRlsDb`, `rlsTransaction`, `withRlsBypass`, `setRlsContext` |
| [`src/lib/auditedAccess.ts`](../src/lib/auditedAccess.ts) | Fail-closed `writeAuditedAccess` |
| [`src/lib/auditMetadataSanitize.ts`](../src/lib/auditMetadataSanitize.ts) | Allowlist-only metadata; `hashRoNumberForAudit` |
| [`src/lib/apex/tenantScope.ts`](../src/lib/apex/tenantScope.ts) | Dealership / national owner guards |
| [`src/lib/apex/platformOperator.ts`](../src/lib/apex/platformOperator.ts) | Explicit platform operator allowlist (no “empty membership = superuser”) |
| [`src/lib/sessionRevocation.ts`](../src/lib/sessionRevocation.ts) | `revokeAllSessionsForTechnician`, scope-switch refresh drop |
| [`src/lib/grokProxyAuth.ts`](../src/lib/grokProxyAuth.ts) | Short-lived HMAC proxy tokens + timing-safe verify |
| [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts) | Distributed KV limits; auth KV production warnings |
| [`prisma/migrations/20250712120000_apex_phase6_1_rls_foundation/`](../prisma/migrations/20250712120000_apex_phase6_1_rls_foundation/) | ENABLE + FORCE RLS policies |
| [`prisma/migrations/20250715120000_apex_phase6_2_rls_default_deny/`](../prisma/migrations/20250715120000_apex_phase6_2_rls_default_deny/) | Default-deny soft-open + Technician / UsageLog RLS |

### Soft-open vs enforced (Phase 6.2+)

| Mode | Soft-open | Enforced |
|------|-----------|----------|
| **Apex** | Never (default-deny without tenant match / bypass) | On by default; `RLS_ENABLED=false` ignored |
| **Merlinus** | Soft-open when not forced | `RLS_ENABLED=true` forces enforce |

- Soft-open requires explicit `app.rls_soft_open=on` (not merely “enforced off”).  
- Control-plane (login, seed, national aggregates) uses `withRlsBypass`.  
- PII routes set `enforced: true` inside `withSessionRls` / `rlsTransaction`.

---

## Security Hardening Sprint (complete)

| Phase | Theme | Highlights |
|-------|--------|------------|
| **6.1** | Owner credentials & session | No hard-coded owner passwords/emails; create-only seed; no login password heal; admin reset sets `mustChangePassword`; re-validate `ownerMayEnterDealership` on refresh; explicit platform operator allowlist |
| **6.2** | RLS default-deny + Grok proxy | Apex enforce-by-default; Technician/UsageLog/DealerGroupMembership RLS; short-lived Grok proxy HMAC tokens; timing-safe compare |
| **6.3** | Manager parity + audit + limits | Manager/admin auto dealership context + `getRlsDb`; allowlist-only audit metadata + RO hash; fail-closed `ro.list`; companion rate limits; production auth KV warnings |
| **6.4** | Finalize | Production KV guidance + boot warnings; MFA/SSO & pen-test roadmap; changelog + pre-rollout complete gates |

**Sprint status: complete** for Critical / High / Medium audit items. Remaining items are product roadmap (MFA/SSO) and operational pen-test.

---

## Owner session model

| State | Allowed | Denied |
|-------|---------|--------|
| **National / group home** | `/api/owner/*`, enter-dealership (scoped rooftops) | RO/PII routes (`DEALERSHIP_CONTEXT_REQUIRED`) |
| **Dealership** | PII routes for active rooftop | National summary / dealership list / re-enter without exit |

- Platform-wide rooftop access requires **explicit** platform operator emails (`APEX_PLATFORM_OWNER_EMAILS` and/or `OWNER_SEED_EMAIL*`).  
- Group owners only see rooftops under their `DealerGroupMembership`.  
- Sentinel `__apex_national__` is never an enterable rooftop.  
- Enter / exit / multi-rooftop select revoke prior apex refresh families before re-issue.  
- Enter rights are re-checked on every owner dealership session rebuild (stale membership cut-off).

---

## Mandatory audit surfaces (non-exhaustive)

| Area | Actions (examples) |
|------|--------------------|
| Auth | `auth.login`, `auth.logout`, `auth.refresh`, `auth.select_dealership`, `auth.password_change`, `auth.clerk_link` |
| Owner | `owner.national_access`, `owner.dealership_enter`, `owner.dealership_exit` |
| Control plane | `dealer.provision` (PII-free metadata only) |
| RO / story | `ro.create`, `ro.read`, `ro.list`, `ro.update`, `ro.delete`, `ro.extract`, `story.*` |
| Compliance | `audit.access`, `image.upload`, `story.pdf_export` |
| Admin | `user.*`, `advisor.*`, `template.save` / `template.use` |

**Metadata policy:** allowlist-only; plaintext RO numbers hashed to `roNumberHash`; no free-text pass-through.

---

## Production rate limiting (Vercel KV)

| Setting | Requirement |
|---------|-------------|
| `KV_REST_API_URL` | **Required in production** — Upstash/Vercel KV REST URL |
| `KV_REST_API_TOKEN` | **Required in production** — REST token |

**Setup**

1. Vercel → Project → **Storage** → Create **KV** (Upstash) → Connect to project  
2. Confirm Production env has both variables  
3. Redeploy  

**Fallback behavior**

- Missing/unhealthy KV → in-memory per-instance limits (availability preserved)  
- Auth routes in production log **`rate_limit.auth_kv_required`** / **`rate_limit.auth_kv_unavailable_fallback`**  
- Startup logs **`rate_limit.production_kv_missing`** when production and KV unset  

Local/dev may omit KV (in-memory is fine).

---

## Dealer provision (control plane)

| Control | Behavior |
|---------|----------|
| Engine | `provisionDealer()` in RLS-bypass transaction (`withRlsBypass`) |
| CLI | `npm run provision-dealer` — passwords never on argv |
| HTTP | `POST /api/owner/provision-dealer` only when `APEX_ALLOW_HTTP_PROVISION=true`; owner **national** scope |
| Audit | `dealer.provision` fail-closed; metadata allow-list (hashes/ids — no email, D7, rooftop name, password) |
| First login | `Technician.mustChangePassword` → API `PASSWORD_CHANGE_REQUIRED` until change-password |
| Session | Password change revokes JWT version + apex refresh + Clerk |

Full operator runbook: [Apex-Dealer-Onboarding.md](./Apex-Dealer-Onboarding.md).

---

## Session revocation matrix

| Event | sessionVersion | Apex refresh | Clerk |
|-------|----------------|--------------|-------|
| Logout | yes | yes | active + linked |
| Password change (self) | yes | yes | linked |
| Forced password change (provision) | yes | yes | linked |
| Admin password reset | yes | yes | linked (+ `mustChangePassword`) |
| User deactivate / delete | yes | yes | linked |
| Owner enter / exit | — | yes (scope switch) | — |
| Multi-rooftop select | — | yes (scope switch) | — |

---

## Roadmap — remaining enterprise items

### MFA / SSO (product)

| Item | Recommendation | Compensating controls today |
|------|----------------|------------------------------|
| **MFA for platform operators** | Require TOTP/WebAuthn (or IdP MFA) for `role=owner` platform accounts before enterprise GTM | Strong unique passwords; create-only seed; session revocation; rate-limited login; audit `auth.login` |
| **SSO (SAML/OIDC)** | Okta / Azure AD / Google Workspace via Clerk or enterprise IdP | Clerk dual/clerk modes already supported for staff linking; legacy D7/email for Apex |

**Target:** schedule MFA for national operators as a hard gate before multi-group production pilots; SSO for dealer-group staff as Phase 7+ identity work.

### Independent pen test

| Item | Recommendation |
|------|----------------|
| **Scope** | Apex multi-tenant isolation, owner enter/exit, provision API (if enabled), auth brute-force, Grok proxy token path, RLS default-deny verification |
| **Timing** | After Phase 6.1–6.4 deploys + RLS migration applied on production Supabase |
| **Evidence** | Written report; retest of Critical/High findings |

Until pen test: internal pre-rollout + fortress integration suite + this document as security baseline.

---

## Verification

```bash
npm run typecheck
npm test
npm run test:integration
npm run smoke:dealer-provision
npm run validate:pre-rollout
```

Security-focused suite: `tests/integration/security-fortress.test.ts`  
Provision suite: `tests/integration/dealer-provision.test.ts`  
Unit guards: `tests/unit/phase63Security.test.ts`, `tests/unit/phase63MediumHardening.test.ts`, `tests/unit/rlsContext.test.ts`, `tests/unit/provisionDealer.test.ts`

---

## Phase 6 PR checklist

| PR | Deliverable |
|----|-------------|
| 6.1 | Owner credential hygiene; enter re-validation; platform operator allowlist |
| 6.2 | RLS default-deny (Apex); Technician RLS; Grok proxy short-lived tokens |
| 6.3 | Manager `getRlsDb` parity; audit allowlist; `ro.list`; companion rate limits; auth KV warnings |
| 6.4 | Production KV docs/boot logs; MFA/SSO + pen-test roadmap; changelog; pre-rollout complete gates |

**Phase 6.0 Security Fortress: complete.**  
**Security Hardening Sprint (6.1–6.4): complete.**
