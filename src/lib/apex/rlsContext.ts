import 'server-only';

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
   * Defaults to isRlsEnabled().
   */
  enforced?: boolean;
  /** Service/seed path — sets app.rls_bypass=on for the transaction. */
  bypass?: boolean;
}

/** True when application should set enforced RLS session vars (defense-in-depth). */
export function isRlsEnabled(): boolean {
  const value = process.env.RLS_ENABLED?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/**
 * Build RLS context from an authenticated session.
 * National owners get scope_mode=national with no active dealership (PII policies deny).
 */
export function rlsContextFromSession(session: TenantScopedSession & Pick<SessionPayload, 'technicianId'>): RlsContext {
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
 * Set transaction-local Postgres session variables for RLS policies.
 * Uses set_config(..., is_local=true) so values do not leak across pooled connections.
 */
export async function setRlsContext(client: RlsDbClient, ctx: RlsContext): Promise<void> {
  const enforced = ctx.enforced ?? isRlsEnabled();
  const bypass = Boolean(ctx.bypass);
  const technicianId = ctx.technicianId?.trim() || '';
  const activeDealershipId = ctx.activeDealershipId?.trim() || '';
  const dealerId = ctx.dealerId?.trim() || '';
  const scopeMode = ctx.scopeMode === 'national' ? 'national' : 'dealership';

  await client.$executeRaw`SELECT set_config('app.rls_enforced', ${enforced ? 'on' : 'off'}, true)`;
  await client.$executeRaw`SELECT set_config('app.rls_bypass', ${bypass ? 'on' : 'off'}, true)`;
  await client.$executeRaw`SELECT set_config('app.scope_mode', ${scopeMode}, true)`;
  await client.$executeRaw`SELECT set_config('app.active_dealership_id', ${activeDealershipId}, true)`;
  await client.$executeRaw`SELECT set_config('app.dealer_id', ${dealerId}, true)`;
  await client.$executeRaw`SELECT set_config('app.technician_id', ${technicianId}, true)`;
}

/**
 * Run work inside a transaction with RLS session vars applied (SET LOCAL).
 * Prefer this for PII reads/writes when RLS_ENABLED=true.
 */
export async function withRlsContext<T>(
  ctx: RlsContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setRlsContext(tx, ctx);
    return fn(tx);
  });
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
