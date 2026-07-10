import type { Prisma } from '@prisma/client';
import { withOptionalDealerId } from '@/lib/apex/dealerScope';
import { scopedPiiWhere, type TenantScopedSession } from '@/lib/apex/tenantScope';
import { withAuth } from '@/lib/apiRoute';
import { getAuditDashboardSummary } from '@/lib/auditSummary';
import { prisma } from '@/lib/db';
import { readRoNumberFromDb } from '@/lib/piiFieldRead';

function buildRoleScopedRoWhere(
  session: TenantScopedSession & {
    technicianId: string;
    serviceAdvisorId: string | null;
  }
): Prisma.RepairOrderWhereInput {
  const piiScope = scopedPiiWhere(session);
  if (session.role === 'manager') {
    return withOptionalDealerId({ dealershipId: piiScope.dealershipId }, piiScope.dealerId);
  }
  if (session.role === 'service_advisor' && session.serviceAdvisorId) {
    return withOptionalDealerId(
      {
        dealershipId: piiScope.dealershipId,
        serviceAdvisorId: session.serviceAdvisorId,
      },
      piiScope.dealerId
    );
  }
  return withOptionalDealerId(
    { dealershipId: piiScope.dealershipId, technicianId: session.technicianId },
    piiScope.dealerId
  );
}

export async function GET(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const { dealershipId } = scopedPiiWhere(session);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const isManager = session.role === 'manager';
      const roWhere = buildRoleScopedRoWhere(session);

      const [totalRos, storiesGenerated, activeTechnicians, recentRos, auditSummary] = await Promise.all([
        prisma.repairOrder.count({ where: roWhere }),
        prisma.repairLine.count({
          where: {
            warrantyStoryEncrypted: { not: null },
            NOT: { warrantyStoryEncrypted: '' },
            repairOrder: roWhere,
          },
        }),
        isManager
          ? prisma.technician.count({ where: { dealershipId, isActive: true, deletedAt: null } })
          : Promise.resolve(0),
        prisma.repairOrder.findMany({
          where: roWhere,
          include: {
            technician: { select: { name: true } },
            repairLines: { select: { warrantyStoryEncrypted: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
        isManager
          ? getAuditDashboardSummary({ dealershipId, dealerId: session.dealerId })
          : null,
      ]);

      const auditScope = scopedPiiWhere(session);
      const activityThisWeek = await prisma.auditLog.count({
        where: isManager
          ? { ...auditScope, createdAt: { gte: weekAgo } }
          : { ...auditScope, technicianId: session.technicianId, createdAt: { gte: weekAgo } },
      });

      return {
        role: session.role,
        stats: {
          totalRepairOrders: totalRos,
          warrantyStories: storiesGenerated,
          activeTechnicians,
          auditEventsThisWeek: activityThisWeek,
        },
        recentRepairOrders: recentRos.map((ro) => ({
          id: ro.id,
          roNumber: readRoNumberFromDb(ro),
          year: ro.year,
          make: ro.make,
          model: ro.model,
          technicianName: ro.technician.name,
          lineCount: ro.repairLines.length,
          hasStories: ro.repairLines.some((l) => Boolean(l.warrantyStoryEncrypted)),
          updatedAt: ro.updatedAt.toISOString(),
        })),
        audit: auditSummary,
      };
    },
    { rateLimitKey: 'dashboard.summary', requireDealershipContext: true }
  );
}