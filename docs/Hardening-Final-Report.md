# Merlinus / Apex — Final Hardening Report

**Release commit:** `dc8f62e`  
**Date:** 2026-07-15  
**Audience:** Engineering, dealership IT, service managers, bay pilot techs  
**Status:** Code complete on `main`. Automated soak suite green. Live staging deploy + physical bay soak require ops credentials / shop tablets (see handoff).

---

## 1. Executive summary

Over a multi-wave hardening push we fixed shop-blocking reliability issues (scan hangs, audit score stalls, save races, cold-login flakiness) and then systematically raised production robustness: merge/conflict handling, idempotent creates, lighter saves, and auth cleanup.

| Wave | Commit | Theme |
|------|--------|--------|
| Scan pipeline | `f5dc5b7` | Photo → extract reliability, OCR hard-reset |
| P0 + P1 | `cbfe4e6` | Merge, companion, retries, session, list, xentry, poll |
| P2 | `6c5143c` | Search abort, voice leak, clone perf, 409 UX, create idempotency |
| **Final** | **`dc8f62e`** | Line PATCH, per-RO queue, batch PUT, auth consolidation |

**Bottom line for the shop:** fewer restarts, less lost typing, fewer duplicate ROs, faster notes/story saves, clearer conflict choices.

---

## 2. Everything completed across all waves

### Reliability / data integrity
- Workflow-aware story weave for Add Tech Details + score reconciliation  
- Client-wins merge after save / companion (stories, notes, xentry media)  
- 409 UX: **Keep mine** / **Use server** (default keep-local after timeout)  
- Create RO **Idempotency-Key** (24h audit replay)  
- `maxRetries: 0` on mutating / AI POSTs  
- Dirty + save-queue gates for companion full snapshots  
- Session probe: **timeout ≠ logged out**; login body applied immediately  

### Performance
- Slim RO list query (no full story/OCR decrypt)  
- Light **PATCH** for line notes/story (not full-document PUT on every keystroke)  
- Shallow clone instead of `structuredClone` on edits  
- Parallel line upserts/deletes/audits on full PUT  
- Companion poll 15s when SSE connected; RO snapshot 8s  
- Xentry multi-photo concurrency = 2  

### Scan / vision
- OCR worker hard-reset on timeout (no restart-to-unstick)  
- Empty MIME / extension accept; upload content-type inference  
- Diagnostics extract uses vision-downscaled payloads  
- Image re-fetch + RO CRUD client timeouts  
- Thumbnail blob fallback when proxy fails  

### Auth / cleanup
- `probeCurrentSession` + `authClient` single entry  
- Dead `useSession` hook removed  
- Merlinus/Apex shells use shared auth helpers  

---

## 3. Automated bay-soak gate (executed 2026-07-15)

Physical bay tablets were **not** available in this environment. The following **automated soak suite** was run as the engineering gate before release:

```
npx tsx --test \
  tests/unit/systemHardeningFinal.test.ts \
  tests/unit/systemHardeningP2.test.ts \
  tests/unit/systemHardeningP0.test.ts \
  tests/unit/scanPipelineHardening.test.ts \
  tests/unit/roPersistenceStoryRace.test.ts \
  tests/unit/storyAuditIntegration.test.ts \
  tests/unit/companionSync.test.ts \
  tests/unit/visionPipeline.test.ts \
  tests/unit/timeouts.test.ts
```

**Result: 70/70 passed** (0 fail).

### Checklist mapping (automated vs human)

| Checklist area | Automated | Human bay (staging) |
|----------------|-----------|---------------------|
| Cold login / session probe | Code + unit tests | Required on staging URL |
| Photo populate / extract | Unit/source + prior fixes | Required on tablets |
| Story typing / light PATCH | Unit tests | Required on tablets |
| 409 Keep mine / Use server | Unit tests | Required 2-device |
| Create idempotency | Unit tests | Double-tap on staging |
| Search abort / sequence | Unit tests | Fast-type on staging |
| Companion dirty pause | Unit tests | Tablet + desktop |

### Staging deploy status (this environment)

| Step | Status |
|------|--------|
| Code on `main` at `dc8f62e` | Done |
| Vercel CLI deploy from this machine | **Blocked** — no `VERCEL_TOKEN` / `vercel login` |
| Local `npm run validate:pre-deploy` | Partial — Sentry DSN warn; DB host unreachable from this agent |
| Production auto-deploy from GitHub → Vercel | Assumed if project is linked to `main` — **ops must confirm** |

**Ops action:** Confirm Vercel staging (or Preview) deployment for commit `dc8f62e`, then complete the human checklist in §6.

---

## 4. Remaining known issues (non-blocking)

| Item | Notes |
|------|--------|
| Apex dealership-select login still a separate module | Correct product split; shared via `authClient` |
| Full PUT for xentry multi-image batches | By design; PATCH is for text typing |
| Companion still has slow poll fallback | Much reduced load; pure SSE is future work |
| Server-side VIN search limited | Client filters loaded rows |
| No multi-tab collaborative editing | 409 + Keep/Use is intentional |

---

## 5. Production / staging soak checklist (bay techs)

Copy this for pilot sign-off. Mark each item after testing on **staging** with real tablets.

### Cold start / login
- [ ] Kill app → reopen → login on shop Wi‑Fi  
- [ ] No “logged out” bounce after slow first load  
- [ ] Password login lands on home without second verify-session failure  

### Photo / extract
- [ ] First RO photo after login populates thumbnail  
- [ ] Process RO scan completes without app restart  
- [ ] Xentry: 3+ photos process without hang; cancel works  
- [ ] Cold extract finishes in a normal window  

### Story / notes typing
- [ ] Type technician notes 30s — UI stays responsive  
- [ ] Add All Tech Details → Audit → score rises / fewer same gaps  
- [ ] Navigate away mid-type — data not lost  

### Save / conflict
- [ ] Edit same RO on tablet + desktop → 409 offers Keep mine / Use server  
- [ ] Keep mine preserves local story/notes  

### Create / search
- [ ] Double-tap create manual RO → only one RO  
- [ ] Scan create once → one RO after process  
- [ ] Type search quickly → final results match last query  

### Companion (if used)
- [ ] Desktop follows tablet navigation  
- [ ] Typing on tablet is not wiped every few seconds  

### Exit criteria for pilot
- [ ] Zero “restart app to unstick scan” reports for 1 week  
- [ ] Zero duplicate ROs from double-tap  
- [ ] No unexplained story loss after generate + save  

---

## 6. Ops handoff — deploy staging & notify team

### Deploy staging (required human step)

```bash
# If Vercel project is linked and token available:
vercel login
# or: $env:VERCEL_TOKEN = "..."
npx vercel --target=preview   # staging/preview
# production only after soak sign-off:
# npx vercel --prod
```

Or: open Vercel dashboard → Project → Deployments → confirm `dc8f62e` / latest `main` is **Ready** on the staging alias.

Then:

```bash
MERLIN_BASE_URL=https://<staging-host> npm run validate:pre-rollout
```

### Notify team (template)

**Subject:** Merlinus hardening release `dc8f62e` ready for staging soak  

**Body:**

We completed the full reliability hardening series and pushed to `main` (`dc8f62e`).

- Scan/extract hang fixes, save merge, companion dirty pause  
- Session cold-start resilience, create RO idempotency  
- Line PATCH for notes/story, per-RO save queues, batched PUTs  

**Engineering gate:** 70 automated soak tests green.  
**Next:** Confirm staging deploy of `dc8f62e`, run the bay checklist in `docs/Hardening-Final-Report.md` §5, then promote to production after sign-off.

Questions: engineering / platform ops.

---

## 7. Commit trail (hardening series)

```
dc8f62e feat: final hardening wave — line PATCH, per-RO queue, batch PUT, auth cleanup
6c5143c feat: P2 hardening — search abort, 409 UX, create idempotency, clone perf
cbfe4e6 feat: P0/P1 system hardening — merge, companion, session, list, xentry
f5dc5b7 fix: harden RO/Xentry photo capture and extract pipeline
207c1ac fix: Add Tech Details re-audit credits woven corrections
```

---

*End of report.*
