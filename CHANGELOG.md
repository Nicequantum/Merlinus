# Changelog

All notable changes to Merlinus are documented here.

## [3.0.1] — 2026-07-10

### Secure dealer provisioning (Apex multi-rooftop)

- **PR-P1** — `provisionDealer()` engine, CLI (`npm run provision-dealer`), templates, `must_change_password` migration, PII-free `dealer.provision` audit.
- **PR-P2** — Operator docs (`docs/Apex-Dealer-Onboarding.md`), forced password change UI gate.
- **PR-P3** — Opt-in `POST /api/owner/provision-dealer` behind `APEX_ALLOW_HTTP_PROVISION=true`.
- **PR-P4** — Integration tests (CLI + HTTP + password gate), `npm run smoke:dealer-provision`, pre-rollout **APEX Dealer Provision** gate.

### Security fortress & Apex platform (prior 3.0.x)

- Phase 6.0 Security Fortress complete (RLS, fail-closed audits, session revocation).
- Owner national scope + multi-rooftop login fixes for Apex mode.

---

## [3.0.0] — 2026-07-02

### Shop-floor release

- **Prompt v3.0.0** — veteran master-technician personas, anti-robotic tone, full 10-step warranty workflow (`THREE_C_GENERATION_RULES` + `SYSTEM_PROMPT`).
- **Diagnostic photos** — auto-save, preview, and delete for RO scan and Xentry diagnostic evidence.
- **Audit Story** — extended Grok scoring timeout (90s), route `maxDuration` 100s, stale-story toast on workflow errors.
- **Xentry cancel UX (L5)** — `cancelProcessing` clears pending diagnostic photo queue again.
- **Rebrand** — repository canonical URL `Nicequantum/Merlinus`; seed password no longer documented in README.
- **ESLint** — zero warnings: Next.js `Image` for photo grids; intentional hook-deps documented.

---

## [2.1.0] — 2026-07-02

### Pre-validation polish

- Updated **Technician Quick Start** and **Bay Reference Card** to match current UI labels (`Generate MI 4.3`, `Diagnostic Evidence`, `Audit Story`, certification flow).
- Added SVG wireframe screenshots in `docs/images/` for print-ready technician documentation.
- Pre-rollout validation now **separates code failures from configuration/env failures** in the summary report.
- Documented **Phase 1 accepted risks** (SSO/MFA, encryption key rotation) with compensating controls in source code.
- Expanded README with **Vercel KV setup** instructions for production rate limiting.
- Removed deprecated `filteredROs` export; public `/api/status` no longer exposes AI configuration.
- Xentry cancel clears pending diagnostic photo queue (parity with RO scan cancel).
- Low-priority audit items L1–L5 verified with unit tests and pre-rollout checks.

### Security & audit (from hardening cycle)

- Vision pipeline mutex, Xentry cancel/abort, diagnostics extract audit trail.
- PII tolerant reads with `piiDecryptWarnings` and client toast feedback.
- Xentry data model separation (RO vs line), audit metadata display in `AuditLogView`.
- `withAuth` uses session compliance versions without extra DB lookups.

---

## [2.0.0] — 2026

Enterprise security hardening release: AES-256-GCM PII encryption, hash-chained audit trail, CSP headers, Customer Pay templates, voice input for shop-floor tablets, and full rollout documentation suite.