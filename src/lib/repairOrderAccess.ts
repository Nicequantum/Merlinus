import 'server-only';

import type { Prisma } from '@prisma/client';
import {
  withOptionalDealerId,
  withOptionalDealerIdOnRepairOrderScope,
} from '@/lib/apex/dealerScope';
import { prisma } from '@/lib/db';
import { isServiceAdvisorActive } from '@/lib/serviceAdvisorAccounts';

export interface RepairOrderAccessSession {
  technicianId: string;
  role: string;
  dealershipId: string;
  serviceAdvisorId?: string | null;
  /** APEX NATIONAL PLATFORM — optional defense-in-depth; sourced from authenticated session only. */
  dealerId?: string | null;
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
  // MERLINUS SINGLE-DEALER: dealershipId remains primary; dealerId is additive when present in session.
  if (session.role === 'manager') {
    return prisma.repairOrder.findFirst({
      where: withOptionalDealerId(
        { id: roId, dealershipId: session.dealershipId },
        session.dealerId
      ),
      include,
    });
  }

  if (session.role === 'service_advisor' && session.serviceAdvisorId) {
    const advisor = await prisma.serviceAdvisor.findFirst({
      where: withOptionalDealerId(
        {
          id: session.serviceAdvisorId,
          dealershipId: session.dealershipId,
          deletedAt: null,
        },
        session.dealerId
      ),
    });
    if (!advisor || !isServiceAdvisorActive(advisor)) return null;

    return prisma.repairOrder.findFirst({
      where: withOptionalDealerId(
        {
          id: roId,
          dealershipId: session.dealershipId,
          serviceAdvisorId: session.serviceAdvisorId,
        },
        session.dealerId
      ),
      include,
    });
  }

  return prisma.repairOrder.findFirst({
    where: withOptionalDealerId(
      {
        id: roId,
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
      },
      session.dealerId
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
  session: Pick<RepairOrderAccessSession, 'dealershipId' | 'dealerId'>
): Prisma.RepairOrderWhereInput {
  return scopedRepairOrderWhere(repairOrderId, session.dealershipId, session.dealerId);
}

/**
 * APEX NATIONAL PLATFORM — scoped repair-line filter using full session.
 * MERLINUS SINGLE-DEALER: identical to scopedRepairLineWhere(..., session.dealershipId) when dealerId absent.
 */
export function scopedRepairLineWhereForSession(
  lineId: string,
  repairOrderId: string,
  session: Pick<RepairOrderAccessSession, 'dealershipId' | 'dealerId'>
): Prisma.RepairLineWhereInput {
  return scopedRepairLineWhere(lineId, repairOrderId, session.dealershipId, session.dealerId);
}