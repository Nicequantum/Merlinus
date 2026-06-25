import type { Prisma } from '@prisma/client';
import { getStartOfDealershipDay } from '@/lib/dealershipDayBoundary';

export type RepairOrderListScope = 'today' | 'previous';

export interface RepairOrderListParams {
  scope: RepairOrderListScope;
  limit: number;
  cursor?: string;
  /** Case-insensitive search across RO number and vehicle fields. */
  q?: string;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export function parseRepairOrderListParams(url: URL): RepairOrderListParams {
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DEFAULT_PAGE_SIZE)
  );
  const scopeParam = url.searchParams.get('scope')?.trim().toLowerCase();
  const scope: RepairOrderListScope = scopeParam === 'previous' ? 'previous' : 'today';
  const cursor = url.searchParams.get('cursor')?.trim() || undefined;
  const q = url.searchParams.get('q')?.trim() || undefined;
  return { scope, limit, cursor, q };
}

export function buildRepairOrderListWhere(
  session: { role: string; dealershipId: string; technicianId: string },
  params: RepairOrderListParams
): Prisma.RepairOrderWhereInput {
  const roleWhere: Prisma.RepairOrderWhereInput =
    session.role === 'manager'
      ? { dealershipId: session.dealershipId }
      : { technicianId: session.technicianId };

  if (params.q) {
    const term = params.q;
    return {
      ...roleWhere,
      OR: [
        { roNumber: { contains: term, mode: 'insensitive' } },
        { year: { contains: term, mode: 'insensitive' } },
        { make: { contains: term, mode: 'insensitive' } },
        { model: { contains: term, mode: 'insensitive' } },
      ],
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