import 'server-only';

import { listDealerIdsForOwnerGroups } from '@/lib/apex/dealerGroupAccess';
import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import { prisma } from '@/lib/db';

export interface OwnerNationalActivityItem {
  id: string;
  action: string;
  dealershipName: string | null;
  dealerCode: string | null;
  createdAt: string;
}

export interface OwnerNationalSummary {
  dealerCount: number;
  dealershipCount: number;
  activeUsers: number;
  repairOrdersLast7Days: number;
  recentActivity: OwnerNationalActivityItem[];
  generatedAt: string;
  /** PR-G2 — group vs platform national portfolio */
  scopeMode?: 'national' | 'group';
  dealerGroupId?: string | null;
  dealerGroupName?: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface OwnerSummaryContext {
  technicianId: string;
  scopeMode?: 'national' | 'group' | 'dealership';
  activeDealerGroupId?: string | null;
  dealerGroupName?: string | null;
}

/**
 * Owner home aggregates — no customer PII.
 * Group owners: scoped to dealers/rooftops in their DealerGroup memberships.
 * Platform national owners: whole platform.
 */
export async function getOwnerNationalSummary(
  context?: OwnerSummaryContext
): Promise<OwnerNationalSummary> {
  const weekAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  const notSentinel = { not: APEX_NATIONAL_DEALERSHIP_ID };

  const scopedDealerIds = context?.technicianId
    ? await listDealerIdsForOwnerGroups(context.technicianId)
    : null;

  const isGroupScoped = Array.isArray(scopedDealerIds);
  const dealerIdList = isGroupScoped
    ? scopedDealerIds.length > 0
      ? scopedDealerIds
      : ['__none__']
    : null;

  const rooftopIds = isGroupScoped
    ? await dealershipIdsForDealers(dealerIdList!)
    : null;

  const [dealerCount, dealershipCount, activeUsers, repairOrdersLast7Days, activityRows] =
    await Promise.all([
      prisma.dealer.count({
        where: isGroupScoped
          ? { status: 'active', id: { in: dealerIdList! } }
          : { status: 'active' },
      }),
      prisma.dealership.count({
        where: isGroupScoped
          ? { id: { in: rooftopIds! } }
          : { id: notSentinel },
      }),
      prisma.technician.count({
        where: {
          isActive: true,
          deletedAt: null,
          role: { not: 'owner' },
          dealershipId: isGroupScoped ? { in: rooftopIds! } : notSentinel,
        },
      }),
      prisma.repairOrder.count({
        where: {
          dealershipId: isGroupScoped ? { in: rooftopIds! } : notSentinel,
          updatedAt: { gte: weekAgo },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          dealershipId: isGroupScoped ? { in: rooftopIds! } : notSentinel,
        },
        select: {
          id: true,
          action: true,
          createdAt: true,
          dealership: {
            select: {
              name: true,
              dealer: { select: { code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);

  return {
    dealerCount,
    dealershipCount,
    activeUsers,
    repairOrdersLast7Days,
    recentActivity: activityRows.map((row) => ({
      id: row.id,
      action: row.action,
      dealershipName: row.dealership.name,
      dealerCode: row.dealership.dealer?.code ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
    scopeMode: isGroupScoped ? 'group' : 'national',
    dealerGroupId: context?.activeDealerGroupId ?? null,
    dealerGroupName: context?.dealerGroupName ?? null,
  };
}

async function dealershipIdsForDealers(dealerIds: string[]): Promise<string[]> {
  if (!dealerIds.length || (dealerIds.length === 1 && dealerIds[0] === '__none__')) {
    return ['__none__'];
  }
  const rows = await prisma.dealership.findMany({
    where: {
      id: { not: APEX_NATIONAL_DEALERSHIP_ID },
      dealerId: { in: dealerIds },
    },
    select: { id: true },
  });
  return rows.length ? rows.map((r) => r.id) : ['__none__'];
}
