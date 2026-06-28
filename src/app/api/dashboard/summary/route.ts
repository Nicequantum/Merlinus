import type { Prisma } from '@prisma/client';
import { withAuth } from '@/lib/apiRoute';
import { getAuditDashboardSummary } from '@/lib/auditSummary';
import { prisma } from '@/lib/db';

function buildRoleScopedRoWhere(session: {
  role: string;
  dealershipId: string;
  technicianId: string;
  serviceAdvisorId: string | null;
}): Prisma.RepairOrderWhereInput {
  if (session.role === 'manager') {
    return { dealershipId: session.dealershipId };
  }
  if (session.role === 'service_advisor' && session.serviceAdvisorId) {
    return { dealershipId: session.dealershipId, serviceAdvisorId: session.serviceAdvisorId };
  }
  return { technicianId: session.technicianId };
}

export async function GET(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const dealershipId = session.dealershipId;
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
        isManager ? getAuditDashboardSummary(dealershipId) : null,
      ]);

      const activityThisWeek = await prisma.auditLog.count({
        where: isManager
          ? { dealershipId, createdAt: { gte: weekAgo } }
          : { dealershipId, technicianId: session.technicianId, createdAt: { gte: weekAgo } },
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
          roNumber: ro.roNumber,
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
    { rateLimitKey: 'dashboard.summary' }
  );
}