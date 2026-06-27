import { prisma } from '@/lib/db';
import { isServiceAdvisorActive } from '@/lib/serviceAdvisorAccounts';

export interface AdvisorDashboardSession {
  role: string;
  dealershipId: string;
  technicianId: string;
  serviceAdvisorId?: string | null;
}

export function isServiceAdvisorUser(session: { role: string }): boolean {
  return session.role === 'service_advisor';
}

export function requireServiceAdvisorLink(
  session: AdvisorDashboardSession
): string | null {
  if (!isServiceAdvisorUser(session)) return null;
  return session.serviceAdvisorId?.trim() || null;
}

export async function canAdvisorAccessRepairOrder(
  session: AdvisorDashboardSession,
  roId: string
) {
  const linkedAdvisorId = requireServiceAdvisorLink(session);
  if (!linkedAdvisorId) return null;

  const ro = await prisma.repairOrder.findFirst({
    where: {
      id: roId,
      dealershipId: session.dealershipId,
      serviceAdvisorId: linkedAdvisorId,
    },
    include: {
      repairLines: { orderBy: { lineNumber: 'asc' } },
      serviceAdvisor: { select: { id: true, displayName: true, status: true, deletedAt: true } },
    },
  });

  if (!ro?.serviceAdvisor || !isServiceAdvisorActive(ro.serviceAdvisor)) {
    return null;
  }

  return ro;
}