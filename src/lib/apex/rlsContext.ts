import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
import type { AuditScopeMode } from '@/lib/apex/platformConstants';
import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import {
  resolveSessionScopeMode,
  type TenantScopedSession,
} from '@/lib/apex/tenantScope';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** Transaction client or root Prisma client that supports $executeRaw. */
export type RlsDbClient = Prisma.TransactionClient | typeof prisma;

export interface RlsContext {
  technicianId: string;
  /** Active rooftop for dealership-scoped PII; empty/null in national scope. */
  activeDealershipId: string | null;
  dealerId: string | null;
  scopeMode: AuditScopeMode;
  /**
   * When true, policies enforce tenant filters (app.rls_enforced=on).
   * Defaults to isRlsEnabled() for generic helpers; PII paths force true via withSessionRls.
   */
  enforced?: boolean;
  /** Service/seed path — sets app.rls_bypass=on for the transaction. */
  bypass?: boolean;
}

const rlsTxStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

/** True when application should set enforced RLS session vars (defense-in-depth). */
export function isRlsEnabled(): boolean {
  const value = process.env.RLS_ENABLED?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/**
 * Build RLS context from an authenticated session.
 * National owners get scope_mode=national with no active dealership (PII policies deny).
 */
export function rlsContextFromSession(
  session: TenantScopedSession & Pick<SessionPayload, 'technicianId'>
): RlsContext {
  const scopeMode = resolveSessionScopeMode(session);
  const rawActive =
    scopeMode === 'dealership'
      ? (session.activeDealershipId?.trim() || session.dealershipId?.trim() || '')
      : '';
  const activeDealershipId =
    rawActive && rawActive !== APEX_NATIONAL_DEALERSHIP_ID ? rawActive : null;

  return {
    technicianId: session.technicianId.trim(),
    activeDealershipId,
    dealerId: session.dealerId?.trim() || null,
    scopeMode,
    enforced: isRlsEnabled(),
  };
}

/**
 * Prisma client for the current request when inside withSessionRls / withRlsContext.
 * Falls back to the global singleton outside an RLS transaction.
 */
export function getRlsDb(): RlsDbClient {
  return rlsTxStorage.getStore() ?? prisma;
}

/** Active RLS transaction client, if any (for joining audits into the same unit of work). */
export function getRlsTransaction(): Prisma.TransactionClient | undefined {
  return rlsTxStorage.getStore();
}

/**
 * Set transaction-local Postgres session variables for RLS policies.
 * Uses set_config(..., is_local=true) so values do not leak across pooled connections.
 */
export async function setRlsContext(client: RlsDbClient, ctx: RlsContext): Promise<void> {
  const enforced = ctx.enforced ?? isRlsEnabled();
  const bypass = Boolean(ctx.bypass);
  const technicianId = ctx.technicianId?.trim() || '';
  const activeDealershipId = ctx.activeDealershipId?.trim() || '';
  const dealerId = ctx.dealerId?.trim() || '';
  // Group home is non-PII like national — only dealership scope enables rooftop RLS filters.
  const scopeMode = ctx.scopeMode === 'dealership' ? 'dealership' : 'national';

  await client.$executeRaw`SELECT set_config('app.rls_enforced', ${enforced ? 'on' : 'off'}, true)`;
  await client.$executeRaw`SELECT set_config('app.rls_bypass', ${bypass ? 'on' : 'off'}, true)`;
  await client.$executeRaw`SELECT set_config('app.scope_mode', ${scopeMode}, true)`;
  await client.$executeRaw`SELECT set_config('app.active_dealership_id', ${activeDealershipId}, true)`;
  await client.$executeRaw`SELECT set_config('app.dealer_id', ${dealerId}, true)`;
  await client.$executeRaw`SELECT set_config('app.technician_id', ${technicianId}, true)`;
}

/**
 * Run work inside a transaction with RLS session vars applied (SET LOCAL).
 */
export async function withRlsContext<T>(
  ctx: RlsContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const existing = rlsTxStorage.getStore();
  if (existing) {
    await setRlsContext(existing, ctx);
    return fn(existing);
  }

  return prisma.$transaction(
    async (tx) => {
      await setRlsContext(tx, ctx);
      return rlsTxStorage.run(tx, () => fn(tx));
    },
    // PII handlers may do several DB round-trips; keep under route maxDuration.
    { maxWait: 15_000, timeout: 30_000 }
  );
}

/**
 * Phase 6.2 — default PII path: enforce tenant RLS for the session and bind getRlsDb().
 * Always sets enforced=on so policies apply even when RLS_ENABLED env is unset
 * (soft-open policies only open when enforced is off).
 */
export async function withSessionRls<T>(
  session: TenantScopedSession & Pick<SessionPayload, 'technicianId'>,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const ctx: RlsContext = {
    ...rlsContextFromSession(session),
    enforced: true,
  };
  return withRlsContext(ctx, fn);
}

/** Seed / migrate / admin maintenance — bypass tenant filters for the transaction. */
export async function withRlsBypass<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return withRlsContext(
    {
      technicianId: '',
      activeDealershipId: null,
      dealerId: null,
      scopeMode: 'dealership',
      enforced: true,
      bypass: true,
    },
    fn
  );
}

/**
 * Atomic multi-step work under RLS. Reuses the ambient withSessionRls transaction
 * when present so nested prisma.$transaction does not open a non-RLS connection.
 * Pass session-derived ctx when calling outside withSessionRls (e.g. after Grok).
 */
export async function rlsTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ctx?: RlsContext
): Promise<T> {
  const existing = rlsTxStorage.getStore();
  if (existing) {
    if (ctx) await setRlsContext(existing, { ...ctx, enforced: ctx.enforced ?? true });
    return fn(existing);
  }
  const effective: RlsContext = ctx
    ? { ...ctx, enforced: ctx.enforced ?? true }
    : {
        technicianId: '',
        activeDealershipId: null,
        dealerId: null,
        scopeMode: 'dealership',
        // Without a session context, stay soft-open (do not enforce empty tenant).
        enforced: false,
      };
  return withRlsContext(effective, fn);
}
