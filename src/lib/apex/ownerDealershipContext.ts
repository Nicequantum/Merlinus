import 'server-only';

import { resolvePrimaryDealerGroupForOwner } from '@/lib/apex/dealerGroupAccess';
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
  scopeMode: AuditScopeMode,
  group?: { id: string; name: string } | null
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
    mustChangePassword: tech.mustChangePassword,
    dealership: { name: dealership.name, dealerId: dealership.dealerId },
  });

  return {
    ...base,
    scopeMode,
    isOwner: true,
    activeDealershipId: scopeMode === 'dealership' ? dealership.id : undefined,
    activeDealerGroupId: scopeMode === 'group' ? group?.id : undefined,
    dealerGroupName: scopeMode === 'group' ? group?.name : undefined,
  };
}

type OwnerTechRow = {
  id: string;
  name: string;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  serviceAdvisorId: string | null;
  sessionVersion: number;
  consentAt: Date | null;
  consentVersion: string | null;
  legalDisclaimerAt: Date | null;
  legalDisclaimerVersion: string | null;
  dealershipId: string;
  mustChangePassword: boolean;
  d7Number: string | null;
  apexUsername: string | null;
};

async function loadOwnerTech(technicianId: string): Promise<OwnerTechRow | null> {
  const tech = await prisma.technician.findUnique({
    where: { id: technicianId.trim() },
    select: {
      id: true,
      name: true,
      role: true,
      isAdmin: true,
      isActive: true,
      deletedAt: true,
      serviceAdvisorId: true,
      sessionVersion: true,
      consentAt: true,
      consentVersion: true,
      legalDisclaimerAt: true,
      legalDisclaimerVersion: true,
      dealershipId: true,
      mustChangePassword: true,
      d7Number: true,
      apexUsername: true,
    },
  });

  if (!tech || !isTechnicianAccountActive(tech) || tech.role !== 'owner') return null;
  return tech;
}

/** Heal mis-stamped dealership FK without wiping owner login identifiers. */
async function healOwnerNationalFk(tech: OwnerTechRow): Promise<void> {
  if (tech.dealershipId === APEX_NATIONAL_DEALERSHIP_ID) return;
  void prisma.technician
    .update({
      where: { id: tech.id },
      data: {
        dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
        dealerId: null,
        // Never clear apexUsername / email — group owners login with username
      },
    })
    .catch(() => undefined);
}

function nationalPayload(tech: OwnerTechRow, scopeMode: 'national' | 'group', group?: { id: string; name: string }) {
  return ownerTechnicianForSession(
    {
      id: tech.id,
      d7Number: tech.d7Number,
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
      mustChangePassword: tech.mustChangePassword,
      dealership: {
        id: APEX_NATIONAL_DEALERSHIP_ID,
        name: scopeMode === 'group' && group ? group.name : APEX_NATIONAL_DEALERSHIP_NAME,
        dealerId: null,
      },
    },
    {
      id: APEX_NATIONAL_DEALERSHIP_ID,
      name: scopeMode === 'group' && group ? group.name : APEX_NATIONAL_DEALERSHIP_NAME,
      dealerId: null,
    },
    scopeMode,
    group
  );
}

/**
 * Platform-wide national owner session (no DealerGroup membership).
 * Prefer {@link buildOwnerHomeSession} for login / exit-dealership.
 */
export async function buildOwnerNationalSession(technicianId: string): Promise<SessionPayload | null> {
  const tech = await loadOwnerTech(technicianId);
  if (!tech) return null;
  await healOwnerNationalFk(tech);
  return nationalPayload(tech, 'national');
}

/** Group-scoped owner home (DealerGroup portfolio). */
export async function buildOwnerGroupSession(
  technicianId: string,
  dealerGroupId: string
): Promise<SessionPayload | null> {
  const tech = await loadOwnerTech(technicianId);
  if (!tech) return null;

  const membership = await prisma.dealerGroupMembership.findFirst({
    where: {
      technicianId: tech.id,
      dealerGroupId: dealerGroupId.trim(),
      isActive: true,
      dealerGroup: { status: 'active' },
    },
    select: {
      dealerGroup: { select: { id: true, name: true } },
    },
  });
  if (!membership) return null;

  await healOwnerNationalFk(tech);
  return nationalPayload(tech, 'group', membership.dealerGroup);
}

/**
 * Login / exit home session:
 * - Active DealerGroup membership → scopeMode group
 * - Otherwise → platform national
 */
export async function buildOwnerHomeSession(technicianId: string): Promise<SessionPayload | null> {
  const tech = await loadOwnerTech(technicianId);
  if (!tech) return null;

  const primaryGroup = await resolvePrimaryDealerGroupForOwner(tech.id);
  if (primaryGroup) {
    return buildOwnerGroupSession(tech.id, primaryGroup.dealerGroupId);
  }
  return buildOwnerNationalSession(tech.id);
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
    select: {
      id: true,
      name: true,
      dealerId: true,
      dealer: { select: { dealerGroupId: true, dealerGroup: { select: { id: true, name: true } } } },
    },
  });

  if (!dealership || dealership.id === APEX_NATIONAL_DEALERSHIP_ID) return null;

  const payload = ownerTechnicianForSession(
    tech as TechnicianForSession & {
      dealership: { id: string; name: string; dealerId: string | null };
    },
    dealership,
    'dealership'
  );

  // Preserve group context while inside a rooftop for exit routing / UI
  const group = dealership.dealer?.dealerGroup;
  if (group) {
    return {
      ...payload,
      activeDealerGroupId: group.id,
      dealerGroupName: group.name,
    };
  }

  return payload;
}
