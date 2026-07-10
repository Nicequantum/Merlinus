import 'server-only';

import {
  APEX_NATIONAL_DEALERSHIP_ID,
  APEX_NATIONAL_DEALERSHIP_NAME,
} from '@/lib/apex/platformConstants';
import type { AuditScopeMode } from '@/lib/apex/platformConstants';
import {
  buildSessionPayloadFromTechnician,
  type SessionPayload,
  type TechnicianForSession,
} from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isTechnicianAccountActive } from '@/lib/technicianAccounts';

function ownerTechnicianForSession(
  tech: TechnicianForSession & {
    dealership: { id: string; name: string; dealerId: string | null };
  },
  dealership: { id: string; name: string; dealerId: string | null },
  scopeMode: AuditScopeMode
): SessionPayload {
  const base = buildSessionPayloadFromTechnician({
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
  });

  return {
    ...base,
    scopeMode,
    isOwner: true,
    activeDealershipId: scopeMode === 'dealership' ? dealership.id : undefined,
  };
}

export async function buildOwnerNationalSession(technicianId: string): Promise<SessionPayload | null> {
  const tech = await prisma.technician.findUnique({
    where: { id: technicianId.trim() },
    include: { dealership: true },
  });

  if (!tech || !isTechnicianAccountActive(tech) || tech.role !== 'owner') return null;

  // Ensure sentinel rooftop exists so owner FK / session dealershipName stay consistent.
  await prisma.dealership.upsert({
    where: { id: APEX_NATIONAL_DEALERSHIP_ID },
    update: { name: APEX_NATIONAL_DEALERSHIP_NAME },
    create: { id: APEX_NATIONAL_DEALERSHIP_ID, name: APEX_NATIONAL_DEALERSHIP_NAME },
  });

  if (tech.dealershipId !== APEX_NATIONAL_DEALERSHIP_ID) {
    await prisma.technician.update({
      where: { id: tech.id },
      data: {
        dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
        dealerId: null,
        d7Number: null,
        apexUsername: null,
      },
    });
  }

  return ownerTechnicianForSession(
    {
      id: tech.id,
      d7Number: null,
      name: tech.name,
      role: tech.role,
      isAdmin: tech.isAdmin,
      dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
      dealerId: null,
      serviceAdvisorId: tech.serviceAdvisorId,
      sessionVersion: tech.sessionVersion,
      consentAt: tech.consentAt,
      consentVersion: tech.consentVersion,
      legalDisclaimerAt: tech.legalDisclaimerAt,
      legalDisclaimerVersion: tech.legalDisclaimerVersion,
      dealership: {
        id: APEX_NATIONAL_DEALERSHIP_ID,
        name: APEX_NATIONAL_DEALERSHIP_NAME,
        dealerId: null,
      },
    },
    {
      id: APEX_NATIONAL_DEALERSHIP_ID,
      name: APEX_NATIONAL_DEALERSHIP_NAME,
      dealerId: null,
    },
    'national'
  );
}

export async function buildOwnerDealershipSession(
  technicianId: string,
  dealershipId: string
): Promise<SessionPayload | null> {
  const tech = await prisma.technician.findUnique({
    where: { id: technicianId.trim() },
    include: { dealership: true },
  });

  if (!tech || !isTechnicianAccountActive(tech) || tech.role !== 'owner') return null;

  const dealership = await prisma.dealership.findUnique({
    where: { id: dealershipId.trim() },
    select: { id: true, name: true, dealerId: true },
  });

  if (!dealership || dealership.id === APEX_NATIONAL_DEALERSHIP_ID) return null;

  return ownerTechnicianForSession(
    tech as TechnicianForSession & {
      dealership: { id: string; name: string; dealerId: string | null };
    },
    dealership,
    'dealership'
  );
}