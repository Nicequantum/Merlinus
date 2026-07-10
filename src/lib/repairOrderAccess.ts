import 'server-only';

import type { Prisma } from '@prisma/client';
import {
  withOptionalDealerId,
  withOptionalDealerIdOnRepairOrderScope,
} from '@/lib/apex/dealerScope';
import { getRlsDb } from '@/lib/apex/rlsContext';
import { scopedPiiWhere, type TenantScopedSession } from '@/lib/apex/tenantScope';
import { isServiceAdvisorActive } from '@/lib/serviceAdvisorAccounts';

export interface RepairOrderAccessSession extends TenantScopedSession {
  technicianId: string;
  serviceAdvisorId?: string | null;
}

export function isServiceAdvisorUser(session: { role: string }): boolean {
  return session.role === 'service_advisor';
}

/** Shared RO access for technicians, managers, and linked service advisor accounts. */
export async function canAccessRepairOrder(
  session: RepairOrderAccessSession,
  roId: string,
  include: Prisma.RepairOrderInclude = { repairLines: true }
) {
  const db = getRlsDb();
  const piiScope = scopedPiiWhere(session);

  if (session.role === 'manager' || session.role === 'owner') {
    return db.repairOrder.findFirst({
      where: withOptionalDealerId(
        { id: roId, dealershipId: piiScope.dealershipId },
        piiScope.dealerId
      ),
      include,
    });
  }

  if (session.role === 'service_advisor' && session.serviceAdvisorId) {
    const advisor = await db.serviceAdvisor.findFirst({
      where: withOptionalDealerId(
        {
          id: session.serviceAdvisorId,
          dealershipId: piiScope.dealershipId,
          deletedAt: null,
        },
        piiScope.dealerId
      ),
    });
    if (!advisor || !isServiceAdvisorActive(advisor)) return null;

    return db.repairOrder.findFirst({
      where: withOptionalDealerId(
        {
          id: roId,
          dealershipId: piiScope.dealershipId,
          serviceAdvisorId: session.serviceAdvisorId,
        },
        piiScope.dealerId
      ),
      include,
    });
  }

  return db.repairOrder.findFirst({
    where: withOptionalDealerId(
      {
        id: roId,
        dealershipId: piiScope.dealershipId,
        technicianId: session.technicianId,
      },
      piiScope.dealerId
    ),
    include,
  });
}

/** Story line routes: load RO with repair lines using role-scoped lookup. */
export async function loadStoryRouteRepairOrder(
  session: RepairOrderAccessSession,
  roId: string
) {
  return canAccessRepairOrder(session, roId, { repairLines: true });
}

/** Defense-in-depth filter for repair-line mutations tied to a dealership-scoped RO. */
export function scopedRepairLineWhere(
  lineId: string,
  repairOrderId: string,
  dealershipId: string,
  dealerId?: string | null
): Prisma.RepairLineWhereInput {
  return {
    id: lineId,
    repairOrder: withOptionalDealerIdOnRepairOrderScope(
      { id: repairOrderId, dealershipId },
      dealerId
    ),
  };
}

/** Defense-in-depth filter for repair-order lookups and mutations. */
export function scopedRepairOrderWhere(
  repairOrderId: string,
  dealershipId: string,
  dealerId?: string | null
): Prisma.RepairOrderWhereInput {
  return withOptionalDealerId({ id: repairOrderId, dealershipId }, dealerId);
}

/**
 * APEX NATIONAL PLATFORM — scoped RO filter using full session (dealershipId + optional dealerId).
 * MERLINUS SINGLE-DEALER: identical to scopedRepairOrderWhere(id, session.dealershipId) when dealerId absent.
 */
export function scopedRepairOrderWhereForSession(
  repairOrderId: string,
  session: TenantScopedSession
): Prisma.RepairOrderWhereInput {
  const piiScope = scopedPiiWhere(session);
  return scopedRepairOrderWhere(repairOrderId, piiScope.dealershipId, piiScope.dealerId);
}

/**
 * APEX NATIONAL PLATFORM — scoped repair-line filter using full session.
 * MERLINUS SINGLE-DEALER: identical to scopedRepairLineWhere(..., session.dealershipId) when dealerId absent.
 */
export function scopedRepairLineWhereForSession(
  lineId: string,
  repairOrderId: string,
  session: TenantScopedSession
): Prisma.RepairLineWhereInput {
  const piiScope = scopedPiiWhere(session);
  return scopedRepairLineWhere(
    lineId,
    repairOrderId,
    piiScope.dealershipId,
    piiScope.dealerId
  );
}