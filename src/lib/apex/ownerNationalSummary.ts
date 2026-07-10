import 'server-only';

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
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** National aggregates only — no customer PII, RO numbers, or technician names. */
export async function getOwnerNationalSummary(): Promise<OwnerNationalSummary> {
  const weekAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  const notSentinel = { not: APEX_NATIONAL_DEALERSHIP_ID };

  const [dealerCount, dealershipCount, activeUsers, repairOrdersLast7Days, activityRows] =
    await Promise.all([
      prisma.dealer.count({ where: { status: 'active' } }),
      prisma.dealership.count({ where: { id: notSentinel } }),
      prisma.technician.count({
        where: {
          isActive: true,
          deletedAt: null,
          role: { not: 'owner' },
          dealershipId: notSentinel,
        },
      }),
      prisma.repairOrder.count({
        where: {
          dealershipId: notSentinel,
          updatedAt: { gte: weekAgo },
        },
      }),
      prisma.auditLog.findMany({
        where: { dealershipId: notSentinel },
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
  };
}