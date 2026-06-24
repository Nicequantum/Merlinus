# Merlin Re-encryption Runbook

**M30:** Post-deploy workflow for migrating legacy plaintext database fields to AES-256-GCM encryption.

## When to run

- After deploying a build that adds new encrypted columns (`roNumberEncrypted`, `descriptionEncrypted`, etc.)
- After restoring a database backup that contains legacy plaintext sensitive fields
- **Not** for `ENCRYPTION_KEY` rotation — that requires a separate key-migration procedure (contact platform maintainer)

## Prerequisites

1. `DATABASE_URL` and `ENCRYPTION_KEY` set in the environment (same key used for normal app operation)
2. Maintenance window or low-traffic period for large databases
3. Database backup completed and verified

## Commands

```bash
# Optional: tune batch size for memory (default 100)
export REENCRYPT_BATCH_SIZE=50

npm run db:reencrypt
```

## What the script does

- Processes tables in batches (`repairOrder`, `repairLine`, `advisorComplaintObservation`, `template`, `knowledgeBase`)
- Skips rows already encrypted (idempotent — safe to re-run)
- Logs `{ table, scanned, updated }` per table

## Verification

1. Spot-check a repair order in the app — VIN, customer name, and stories display correctly
2. Run `npm run validate:pre-rollout` — encryption round-trip check must pass
3. Review script output: `updated` should trend to `0` on second run

## Troubleshooting

| Symptom | Action |
|---------|--------|
| `encryption.decrypt_failed` in logs | Row encrypted with a different key — restore backup or contact support |
| Script OOM / slow | Lower `REENCRYPT_BATCH_SIZE` to 25–50 |
| Partial completion | Re-run `npm run db:reencrypt` — only unmigrated rows are updated |

## Rollback

Restore the pre-migration database backup. Do not change `ENCRYPTION_KEY` without a planned rotation.