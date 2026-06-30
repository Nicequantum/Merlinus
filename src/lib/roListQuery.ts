import 'server-only';

import type { Prisma } from '@prisma/client';
import { getStartOfDealershipDay } from '@/lib/dealershipDayBoundary';
import { buildRoNumberSearchQueryTokens } from '@/lib/piiSearchToken';
import { repairOrderListQuerySchema } from '@/lib/validation';

export type RepairOrderListScope = 'today' | 'previous';

export interface RepairOrderListParams {
  scope: RepairOrderListScope;
  limit: number;
  cursor?: string;
  /** Case-insensitive search across RO number and vehicle fields. */
  q?: string;
}

export function parseRepairOrderListParams(url: URL): RepairOrderListParams {
  const raw = Object.fromEntries(url.searchParams.entries());
  return repairOrderListQuerySchema.parse(raw);
}

export function buildRepairOrderListWhere(
  session: {
    role: string;
    dealershipId: string;
    technicianId: string;
    serviceAdvisorId?: string | null;
  },
  params: RepairOrderListParams
): Prisma.RepairOrderWhereInput {
  const roleWhere: Prisma.RepairOrderWhereInput =
    session.role === 'manager'
      ? { dealershipId: session.dealershipId }
      : session.role === 'service_advisor' && session.serviceAdvisorId
        ? { dealershipId: session.dealershipId, serviceAdvisorId: session.serviceAdvisorId }
        : { dealershipId: session.dealershipId, technicianId: session.technicianId };

  if (params.q) {
    const term = params.q;
    const roSearchTokens = buildRoNumberSearchQueryTokens(term);
    const orClauses: Prisma.RepairOrderWhereInput[] = [
      { year: { contains: term, mode: 'insensitive' } },
      { make: { contains: term, mode: 'insensitive' } },
      { model: { contains: term, mode: 'insensitive' } },
    ];

    if (roSearchTokens.length > 0) {
      orClauses.unshift({ roNumberSearchTokens: { hasSome: roSearchTokens } });
    }

    return {
      ...roleWhere,
      OR: orClauses,
    };
  }

  const startOfToday = getStartOfDealershipDay();
  if (params.scope === 'previous') {
    return {
      ...roleWhere,
      updatedAt: { lt: startOfToday },
    };
  }

  // Today's active work — touched since dealership-local midnight.
  return {
    ...roleWhere,
    updatedAt: { gte: startOfToday },
  };
}

export function getTodayStartIso(): string {
  return getStartOfDealershipDay().toISOString();
}