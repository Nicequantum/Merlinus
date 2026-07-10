import 'server-only';

import { listDealerIdsForOwnerGroups } from '@/lib/apex/dealerGroupAccess';
import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import { prisma } from '@/lib/db';

export interface OwnerNationalActivityItem {
  id: string;
  action: string;
  dealershipName: string | null;
  dealerCode: string | null;
  createdAt: string;
}

/** Per-rooftop scoreboard (PII-free). */
export interface OwnerRooftopScorecard {
  dealershipId: string;
  name: string;
  dealerCode: string | null;
  dealerName: string | null;
  activeStaff: number;
  roVolume7d: number;
  roVolume30d: number;
  certifiedStories7d: number;
  certifiedStories30d: number;
  /** Distinct staff with login/activity in last 7d / active staff (0–100). */
  adoptionRatePct: number;
  /** healthy | watch | attention */
  status: 'healthy' | 'watch' | 'attention';
  attentionReasons: string[];
  lastActivityAt: string | null;
}

export interface OwnerAttentionFlag {
  code: string;
  label: string;
  severity: 'watch' | 'attention';
  dealershipId?: string;
  dealershipName?: string;
}

export interface OwnerNationalSummary {
  /** Brands / dealers in portfolio */
  dealerCount: number;
  /** Rooftops active */
  dealershipCount: number;
  /** Active non-owner staff */
  activeUsers: number;
  /** @deprecated prefer repairOrders7d — kept for older clients */
  repairOrdersLast7Days: number;
  repairOrders7d: number;
  repairOrders30d: number;
  certifiedStories7d: number;
  certifiedStories30d: number;
  /** % active staff with activity in last 7 days (0–100) */
  adoptionRatePct: number;
  attentionFlagCount: number;
  attentionFlags: OwnerAttentionFlag[];
  rooftops: OwnerRooftopScorecard[];
  recentActivity: OwnerNationalActivityItem[];
  generatedAt: string;
  scopeMode?: 'national' | 'group';
  dealerGroupId?: string | null;
  dealerGroupName?: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface OwnerSummaryContext {
  technicianId: string;
  scopeMode?: 'national' | 'group' | 'dealership';
  activeDealerGroupId?: string | null;
  dealerGroupName?: string | null;
}

/**
 * Owner home aggregates — no customer PII.
 * Group owners: scoped to DealerGroup memberships.
 * Platform national owners: whole platform.
 */
export async function getOwnerNationalSummary(
  context?: OwnerSummaryContext
): Promise<OwnerNationalSummary> {
  const now = Date.now();
  const weekAgo = new Date(now - SEVEN_DAYS_MS);
  const monthAgo = new Date(now - THIRTY_DAYS_MS);
  const notSentinel = { not: APEX_NATIONAL_DEALERSHIP_ID };

  const scopedDealerIds = context?.technicianId
    ? await listDealerIdsForOwnerGroups(context.technicianId)
    : null;

  const isGroupScoped = Array.isArray(scopedDealerIds);
  const dealerIdList =
    isGroupScoped && scopedDealerIds.length > 0 ? scopedDealerIds : isGroupScoped ? ['__none__'] : null;

  const rooftops = await loadRooftopRows(dealerIdList);
  const rooftopIds = rooftops.map((r) => r.id);
  const effectiveRooftopIds = rooftopIds.length > 0 ? rooftopIds : ['__none__'];

  const [
    dealerCount,
    activeUsers,
    ro7,
    ro30,
    cert7,
    cert30,
    activeStaffWithActivity7d,
    activityRows,
    mustChangePasswordCount,
    lastActivityByRooftop,
    staffByRooftop,
    ro7ByRooftop,
    ro30ByRooftop,
    cert7ByRooftop,
    cert30ByRooftop,
    activeStaffByRooftop7d,
  ] = await Promise.all([
    prisma.dealer.count({
      where: isGroupScoped
        ? { status: 'active', id: { in: dealerIdList! } }
        : { status: 'active' },
    }),
    prisma.technician.count({
      where: {
        isActive: true,
        deletedAt: null,
        role: { not: 'owner' },
        dealershipId: { in: effectiveRooftopIds },
      },
    }),
    prisma.repairOrder.count({
      where: { dealershipId: { in: effectiveRooftopIds }, updatedAt: { gte: weekAgo } },
    }),
    prisma.repairOrder.count({
      where: { dealershipId: { in: effectiveRooftopIds }, updatedAt: { gte: monthAgo } },
    }),
    prisma.technicianCertifiedStory.count({
      where: { dealershipId: { in: effectiveRooftopIds }, certifiedAt: { gte: weekAgo } },
    }),
    prisma.technicianCertifiedStory.count({
      where: { dealershipId: { in: effectiveRooftopIds }, certifiedAt: { gte: monthAgo } },
    }),
    prisma.auditLog.findMany({
      where: {
        dealershipId: { in: effectiveRooftopIds },
        createdAt: { gte: weekAgo },
        technicianId: { not: null },
        action: { in: ['auth.login', 'auth.refresh', 'ro.create', 'story.certify', 'story.generate'] },
      },
      select: { technicianId: true },
      distinct: ['technicianId'],
    }),
    prisma.auditLog.findMany({
      where: { dealershipId: { in: effectiveRooftopIds } },
      select: {
        id: true,
        action: true,
        createdAt: true,
        dealership: {
          select: { name: true, dealer: { select: { code: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.technician.count({
      where: {
        isActive: true,
        deletedAt: null,
        mustChangePassword: true,
        role: { not: 'owner' },
        dealershipId: { in: effectiveRooftopIds },
      },
    }),
    prisma.auditLog.groupBy({
      by: ['dealershipId'],
      where: { dealershipId: { in: effectiveRooftopIds } },
      _max: { createdAt: true },
    }),
    prisma.technician.groupBy({
      by: ['dealershipId'],
      where: {
        isActive: true,
        deletedAt: null,
        role: { not: 'owner' },
        dealershipId: { in: effectiveRooftopIds },
      },
      _count: { _all: true },
    }),
    prisma.repairOrder.groupBy({
      by: ['dealershipId'],
      where: { dealershipId: { in: effectiveRooftopIds }, updatedAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.repairOrder.groupBy({
      by: ['dealershipId'],
      where: { dealershipId: { in: effectiveRooftopIds }, updatedAt: { gte: monthAgo } },
      _count: { _all: true },
    }),
    prisma.technicianCertifiedStory.groupBy({
      by: ['dealershipId'],
      where: { dealershipId: { in: effectiveRooftopIds }, certifiedAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.technicianCertifiedStory.groupBy({
      by: ['dealershipId'],
      where: { dealershipId: { in: effectiveRooftopIds }, certifiedAt: { gte: monthAgo } },
      _count: { _all: true },
    }),
    prisma.auditLog.groupBy({
      by: ['dealershipId', 'technicianId'],
      where: {
        dealershipId: { in: effectiveRooftopIds },
        createdAt: { gte: weekAgo },
        technicianId: { not: null },
        action: { in: ['auth.login', 'auth.refresh', 'ro.create', 'story.certify', 'story.generate'] },
      },
    }),
  ]);

  const lastActivityMap = new Map(
    lastActivityByRooftop.map((r) => [r.dealershipId, r._max.createdAt])
  );
  const staffMap = new Map(staffByRooftop.map((r) => [r.dealershipId, r._count._all]));
  const ro7Map = new Map(ro7ByRooftop.map((r) => [r.dealershipId, r._count._all]));
  const ro30Map = new Map(ro30ByRooftop.map((r) => [r.dealershipId, r._count._all]));
  const cert7Map = new Map(cert7ByRooftop.map((r) => [r.dealershipId, r._count._all]));
  const cert30Map = new Map(cert30ByRooftop.map((r) => [r.dealershipId, r._count._all]));

  const activeStaffIdsByRooftop = new Map<string, Set<string>>();
  for (const row of activeStaffByRooftop7d) {
    if (!row.technicianId) continue;
    const set = activeStaffIdsByRooftop.get(row.dealershipId) ?? new Set();
    set.add(row.technicianId);
    activeStaffIdsByRooftop.set(row.dealershipId, set);
  }

  const attentionFlags: OwnerAttentionFlag[] = [];
  const scorecards: OwnerRooftopScorecard[] = rooftops.map((r) => {
    const activeStaff = staffMap.get(r.id) ?? 0;
    const roVolume7d = ro7Map.get(r.id) ?? 0;
    const roVolume30d = ro30Map.get(r.id) ?? 0;
    const certifiedStories7d = cert7Map.get(r.id) ?? 0;
    const certifiedStories30d = cert30Map.get(r.id) ?? 0;
    const activeIn7d = activeStaffIdsByRooftop.get(r.id)?.size ?? 0;
    const adoptionRatePct =
      activeStaff > 0 ? Math.round((activeIn7d / activeStaff) * 100) : activeStaff === 0 ? 0 : 0;
    const lastAt = lastActivityMap.get(r.id) ?? null;
    const daysSinceActivity = lastAt
      ? (now - lastAt.getTime()) / (24 * 60 * 60 * 1000)
      : Number.POSITIVE_INFINITY;

    const attentionReasons: string[] = [];
    if (activeStaff === 0) attentionReasons.push('No active staff');
    if (roVolume7d === 0 && activeStaff > 0) attentionReasons.push('No RO activity in 7 days');
    if (daysSinceActivity > 14) attentionReasons.push('No platform activity in 14+ days');
    if (adoptionRatePct < 40 && activeStaff >= 2) attentionReasons.push('Low adoption (<40%)');

    let status: OwnerRooftopScorecard['status'] = 'healthy';
    if (attentionReasons.length >= 2 || activeStaff === 0 || daysSinceActivity > 14) {
      status = 'attention';
    } else if (attentionReasons.length === 1 || adoptionRatePct < 60) {
      status = 'watch';
    }

    if (status !== 'healthy') {
      for (const reason of attentionReasons) {
        attentionFlags.push({
          code: reason.toLowerCase().replace(/\s+/g, '_').slice(0, 48),
          label: reason,
          severity: status === 'attention' ? 'attention' : 'watch',
          dealershipId: r.id,
          dealershipName: r.name,
        });
      }
    }

    return {
      dealershipId: r.id,
      name: r.name,
      dealerCode: r.dealerCode,
      dealerName: r.dealerName,
      activeStaff,
      roVolume7d,
      roVolume30d,
      certifiedStories7d,
      certifiedStories30d,
      adoptionRatePct,
      status,
      attentionReasons,
      lastActivityAt: lastAt?.toISOString() ?? null,
    };
  });

  if (mustChangePasswordCount > 0) {
    attentionFlags.push({
      code: 'password_change_pending',
      label: `${mustChangePasswordCount} staff must change temporary password`,
      severity: 'watch',
    });
  }

  const adoptionRatePct =
    activeUsers > 0
      ? Math.round((activeStaffWithActivity7d.length / activeUsers) * 100)
      : 0;

  // Dedupe flags by label+dealership
  const seen = new Set<string>();
  const uniqueFlags = attentionFlags.filter((f) => {
    const key = `${f.dealershipId ?? ''}:${f.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    dealerCount,
    dealershipCount: rooftops.length,
    activeUsers,
    repairOrdersLast7Days: ro7,
    repairOrders7d: ro7,
    repairOrders30d: ro30,
    certifiedStories7d: cert7,
    certifiedStories30d: cert30,
    adoptionRatePct,
    attentionFlagCount: uniqueFlags.length,
    attentionFlags: uniqueFlags.slice(0, 20),
    rooftops: scorecards.sort((a, b) => a.name.localeCompare(b.name)),
    recentActivity: activityRows.map((row) => ({
      id: row.id,
      action: row.action,
      dealershipName: row.dealership.name,
      dealerCode: row.dealership.dealer?.code ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
    scopeMode: isGroupScoped ? 'group' : 'national',
    dealerGroupId: context?.activeDealerGroupId ?? null,
    dealerGroupName: context?.dealerGroupName ?? null,
  };
}

async function loadRooftopRows(dealerIdList: string[] | null): Promise<
  Array<{
    id: string;
    name: string;
    dealerCode: string | null;
    dealerName: string | null;
  }>
> {
  if (dealerIdList) {
    const rows = await prisma.dealership.findMany({
      where: {
        id: { not: APEX_NATIONAL_DEALERSHIP_ID },
        dealerId: { in: dealerIdList },
      },
      select: {
        id: true,
        name: true,
        dealer: { select: { code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      dealerCode: r.dealer?.code ?? null,
      dealerName: r.dealer?.name ?? null,
    }));
  }

  const rows = await prisma.dealership.findMany({
    where: { id: { not: APEX_NATIONAL_DEALERSHIP_ID } },
    select: {
      id: true,
      name: true,
      dealer: { select: { code: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    dealerCode: r.dealer?.code ?? null,
    dealerName: r.dealer?.name ?? null,
  }));
}
