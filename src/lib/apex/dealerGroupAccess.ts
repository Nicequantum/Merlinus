import 'server-only';

import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import { prisma } from '@/lib/db';

export interface OwnerDealerGroupMembership {
  dealerGroupId: string;
  dealerGroupCode: string;
  dealerGroupName: string;
  legalName: string | null;
  role: string;
  isPrimary: boolean;
}

/** Active DealerGroup memberships for an owner technician. */
export async function listOwnerDealerGroupMemberships(
  technicianId: string
): Promise<OwnerDealerGroupMembership[]> {
  const rows = await prisma.dealerGroupMembership.findMany({
    where: {
      technicianId: technicianId.trim(),
      isActive: true,
      dealerGroup: { status: 'active' },
    },
    select: {
      role: true,
      isPrimary: true,
      dealerGroup: {
        select: { id: true, code: true, name: true, legalName: true },
      },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });

  return rows.map((row) => ({
    dealerGroupId: row.dealerGroup.id,
    dealerGroupCode: row.dealerGroup.code,
    dealerGroupName: row.dealerGroup.name,
    legalName: row.dealerGroup.legalName,
    role: row.role,
    isPrimary: row.isPrimary,
  }));
}

/** Primary membership, or first active group if none marked primary. */
export async function resolvePrimaryDealerGroupForOwner(
  technicianId: string
): Promise<OwnerDealerGroupMembership | null> {
  const memberships = await listOwnerDealerGroupMemberships(technicianId);
  if (memberships.length === 0) return null;
  return memberships.find((m) => m.isPrimary) ?? memberships[0] ?? null;
}

/**
 * Dealership ids an owner may enter.
 * - Group member: rooftops under dealers in their active group memberships
 * - Platform owner (no memberships): all non-sentinel rooftops
 */
export async function listEnterableDealershipsForOwner(technicianId: string): Promise<
  Array<{ id: string; name: string; dealerCode: string | null; dealerGroupId: string | null }>
> {
  const memberships = await listOwnerDealerGroupMemberships(technicianId);
  const groupIds = memberships.map((m) => m.dealerGroupId);

  if (groupIds.length === 0) {
    const dealerships = await prisma.dealership.findMany({
      where: { id: { not: APEX_NATIONAL_DEALERSHIP_ID } },
      select: {
        id: true,
        name: true,
        dealerId: true,
        dealer: { select: { code: true, dealerGroupId: true } },
      },
      orderBy: { name: 'asc' },
    });
    return dealerships.map((d) => ({
      id: d.id,
      name: d.name,
      dealerCode: d.dealer?.code ?? null,
      dealerGroupId: d.dealer?.dealerGroupId ?? null,
    }));
  }

  const dealerships = await prisma.dealership.findMany({
    where: {
      id: { not: APEX_NATIONAL_DEALERSHIP_ID },
      dealer: { dealerGroupId: { in: groupIds } },
    },
    select: {
      id: true,
      name: true,
      dealer: { select: { code: true, dealerGroupId: true } },
    },
    orderBy: { name: 'asc' },
  });

  return dealerships.map((d) => ({
    id: d.id,
    name: d.name,
    dealerCode: d.dealer?.code ?? null,
    dealerGroupId: d.dealer?.dealerGroupId ?? null,
  }));
}

/** True if owner may enter this rooftop (group membership or platform owner). */
export async function ownerMayEnterDealership(
  technicianId: string,
  dealershipId: string
): Promise<boolean> {
  const id = dealershipId.trim();
  if (!id || id === APEX_NATIONAL_DEALERSHIP_ID) return false;

  const memberships = await listOwnerDealerGroupMemberships(technicianId);
  if (memberships.length === 0) {
    // Platform national owner — any real rooftop
    const exists = await prisma.dealership.findUnique({
      where: { id },
      select: { id: true },
    });
    return Boolean(exists);
  }

  const groupIds = memberships.map((m) => m.dealerGroupId);
  const rooftop = await prisma.dealership.findFirst({
    where: {
      id,
      dealer: { dealerGroupId: { in: groupIds } },
    },
    select: { id: true },
  });
  return Boolean(rooftop);
}

/** Dealer ids in the owner's groups (for summary filters). */
export async function listDealerIdsForOwnerGroups(technicianId: string): Promise<string[] | null> {
  const memberships = await listOwnerDealerGroupMemberships(technicianId);
  if (memberships.length === 0) return null; // platform-wide

  const dealers = await prisma.dealer.findMany({
    where: {
      dealerGroupId: { in: memberships.map((m) => m.dealerGroupId) },
      status: 'active',
    },
    select: { id: true },
  });
  return dealers.map((d) => d.id);
}
