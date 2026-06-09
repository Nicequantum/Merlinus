import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';

/** Manager-only snapshot for verifying Phase 1 advisor capture during live testing. */
export async function GET(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const dealershipId = session.dealershipId;

      const [advisorCount, observationCount, profileCount, linkedRos, recentAdvisors, recentCaptures] =
        await Promise.all([
          prisma.serviceAdvisor.count({ where: { dealershipId, status: 'active' } }),
          prisma.advisorComplaintObservation.count({ where: { dealershipId } }),
          prisma.advisorWritingProfile.count({
            where: { serviceAdvisor: { dealershipId } },
          }),
          prisma.repairOrder.count({
            where: { dealershipId, serviceAdvisorId: { not: null } },
          }),
          prisma.serviceAdvisor.findMany({
            where: { dealershipId, status: 'active' },
            orderBy: { lastSeenAt: 'desc' },
            take: 8,
            select: {
              id: true,
              displayName: true,
              roCount: true,
              lastSeenAt: true,
              profile: {
                select: {
                  observationCount: true,
                  lastComputedAt: true,
                },
              },
            },
          }),
          prisma.auditLog.findMany({
            where: { dealershipId, action: 'advisor.capture' },
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              createdAt: true,
              metadata: true,
            },
          }),
        ]);

      return {
        advisorIntelligence: {
          advisors: advisorCount,
          observations: observationCount,
          profiles: profileCount,
          linkedRepairOrders: linkedRos,
          recentAdvisors: recentAdvisors.map((advisor) => ({
            id: advisor.id,
            displayName: advisor.displayName,
            roCount: advisor.roCount,
            lastSeenAt: advisor.lastSeenAt.toISOString(),
            observationCount: advisor.profile?.observationCount ?? 0,
            profileUpdatedAt: advisor.profile?.lastComputedAt?.toISOString() ?? null,
          })),
          recentCaptures: recentCaptures.map((entry) => ({
            id: entry.id,
            createdAt: entry.createdAt.toISOString(),
            metadata: JSON.parse(entry.metadata || '{}') as Record<string, unknown>,
          })),
        },
      };
    },
    { rateLimitKey: 'advisors.summary', requireManager: true }
  );
}