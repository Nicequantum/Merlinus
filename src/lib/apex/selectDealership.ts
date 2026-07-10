import 'server-only';

import type { Prisma } from '@prisma/client';
import {
  buildSessionPayloadFromTechnician,
  type SessionPayload,
  type TechnicianForSession,
} from '@/lib/auth';
import { assertDealershipMembership } from '@/lib/apex/membershipGuard';
import { prisma } from '@/lib/db';
import { isTechnicianAccountActive } from '@/lib/technicianAccounts';

type TechnicianWithDealership = Prisma.TechnicianGetPayload<{
  include: { dealership: true };
}>;

function toTechnicianForSession(
  tech: TechnicianWithDealership,
  dealership: { id: string; name: string; dealerId: string | null }
): TechnicianForSession {
  return {
    id: tech.id,
    d7Number: tech.d7Number,
    name: tech.name,
    role: tech.role,
    isAdmin: tech.isAdmin,
    dealershipId: dealership.id,
    dealerId: tech.dealerId ?? dealership.dealerId,
    serviceAdvisorId: tech.serviceAdvisorId,
    sessionVersion: tech.sessionVersion,
    consentAt: tech.consentAt,
    consentVersion: tech.consentVersion,
    legalDisclaimerAt: tech.legalDisclaimerAt,
    legalDisclaimerVersion: tech.legalDisclaimerVersion,
    dealership: { name: dealership.name, dealerId: dealership.dealerId },
  };
}

/**
 * Finalize login after multi-dealership selection — verifies membership and optional primary flag.
 */
export async function resolveSelectDealershipSession(input: {
  technicianId: string;
  dealershipId: string;
  rememberAsDefault?: boolean;
}): Promise<SessionPayload | null> {
  const tech = await prisma.technician.findUnique({
    where: { id: input.technicianId.trim() },
    include: { dealership: true },
  });

  if (!tech || !isTechnicianAccountActive(tech)) return null;
  if (tech.role === 'owner') return null;
  if (tech.role === 'service_advisor' && !tech.serviceAdvisorId) return null;

  const membership = await assertDealershipMembership(tech.id, input.dealershipId, {
    includeDealership: true,
  });

  if (input.rememberAsDefault) {
    await prisma.$transaction([
      prisma.technicianDealership.updateMany({
        where: { technicianId: tech.id },
        data: { isPrimary: false },
      }),
      prisma.technicianDealership.update({
        where: {
          technicianId_dealershipId: {
            technicianId: tech.id,
            dealershipId: membership.dealershipId,
          },
        },
        data: { isPrimary: true },
      }),
    ]);
  }

  const dealership =
    'dealership' in membership
      ? membership.dealership
      : await prisma.dealership.findUniqueOrThrow({
          where: { id: membership.dealershipId },
          select: { id: true, name: true, dealerId: true },
        });

  return buildSessionPayloadFromTechnician(
    toTechnicianForSession(tech, {
      id: dealership.id,
      name: dealership.name,
      dealerId: dealership.dealerId,
    })
  );
}