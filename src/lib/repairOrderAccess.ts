import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isServiceAdvisorActive } from '@/lib/serviceAdvisorAccounts';

export interface RepairOrderAccessSession {
  technicianId: string;
  role: string;
  dealershipId: string;
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
  if (session.role === 'manager') {
    return prisma.repairOrder.findFirst({
      where: { id: roId, dealershipId: session.dealershipId },
      include,
    });
  }

  if (session.role === 'service_advisor' && session.serviceAdvisorId) {
    const advisor = await prisma.serviceAdvisor.findFirst({
      where: {
        id: session.serviceAdvisorId,
        dealershipId: session.dealershipId,
        deletedAt: null,
      },
    });
    if (!advisor || !isServiceAdvisorActive(advisor)) return null;

    return prisma.repairOrder.findFirst({
      where: {
        id: roId,
        dealershipId: session.dealershipId,
        serviceAdvisorId: session.serviceAdvisorId,
      },
      include,
    });
  }

  return prisma.repairOrder.findFirst({
    where: {
      id: roId,
      dealershipId: session.dealershipId,
      technicianId: session.technicianId,
    },
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