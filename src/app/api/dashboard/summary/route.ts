import { withAuth } from '@/lib/apiRoute';
import { getAuditDashboardSummary } from '@/lib/auditSummary';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const dealershipId = session.dealershipId;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [totalRos, storiesGenerated, activeTechnicians, recentRos, auditSummary] = await Promise.all([
        prisma.repairOrder.count({ where: { dealershipId } }),
        prisma.repairLine.count({
          where: {
            warrantyStoryEncrypted: { not: null },
            NOT: { warrantyStoryEncrypted: '' },
            repairOrder: { dealershipId },
          },
        }),
        prisma.technician.count({ where: { dealershipId, isActive: true } }),
        prisma.repairOrder.findMany({
          where: { dealershipId },
          include: {
            technician: { select: { name: true } },
            repairLines: { select: { warrantyStoryEncrypted: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
        session.role === 'manager' ? getAuditDashboardSummary(dealershipId) : null,
      ]);

      const activityThisWeek = await prisma.auditLog.count({
        where: { dealershipId, createdAt: { gte: weekAgo } },
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