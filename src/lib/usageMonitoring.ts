import { dealerIdWriteFields, scopedDealershipWhere } from '@/lib/apex/dealerScope';
import { prisma } from './db';

/** M28: configurable daily AI usage cap per technician. */
function parseDailyLimit(): number {
  const raw = Number(process.env.DAILY_USAGE_LIMIT ?? 50);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 50;
}

export const DAILY_USAGE_LIMIT = parseDailyLimit();

/** M29: dealership-local midnight for usage boundaries (IANA timezone). */
function getUsageTimezone(): string {
  return process.env.USAGE_TIMEZONE?.trim() || 'America/New_York';
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function startOfZonedDay(date = new Date()): Date {
  const tz = getUsageTimezone();
  const { year, month, day } = zonedParts(date, tz);
  // Walk UTC offsets until the formatted zoned calendar date matches target midnight.
  for (let offsetHours = -14; offsetHours <= 14; offsetHours++) {
    const candidate = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0, 0));
    const parts = zonedParts(candidate, tz);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === 0) {
      return candidate;
    }
  }
  const fallback = new Date();
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

function startOfZonedWeek(date = new Date()): Date {
  const dayStart = startOfZonedDay(date);
  const tz = getUsageTimezone();
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(dayStart);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const daysFromMonday = map[weekday] ?? 0;
  return new Date(dayStart.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
}

export async function getTechnicianDailyUsageCount(technicianId: string): Promise<number> {
  return prisma.usageLog.count({
    where: {
      technicianId,
      createdAt: { gte: startOfZonedDay() },
    },
  });
}

export async function isDailyUsageLimitReached(technicianId: string): Promise<boolean> {
  const count = await getTechnicianDailyUsageCount(technicianId);
  return count >= DAILY_USAGE_LIMIT;
}

export async function logApiUsage(input: {
  technicianId: string;
  dealershipId: string;
  dealerId?: string | null;
  routeKey: string;
}): Promise<void> {
  await prisma.usageLog.create({
    data: {
      technicianId: input.technicianId,
      dealershipId: input.dealershipId,
      routeKey: input.routeKey,
      ...dealerIdWriteFields(input.dealerId),
    },
  });
}

export interface TechnicianUsageSummary {
  technicianId: string;
  name: string;
  d7Number: string | null;
  role: string;
  dailyCount: number;
  weeklyCount: number;
}

export interface UsageAnalytics {
  dailyLimit: number;
  totalDailyUsage: number;
  technicians: TechnicianUsageSummary[];
}

export async function getUsageAnalytics(
  dealershipId: string,
  dealerId?: string | null
): Promise<UsageAnalytics> {
  const dayStart = startOfZonedDay();
  const weekStart = startOfZonedWeek();
  const usageWhere = scopedDealershipWhere(dealershipId, dealerId);

  const [technicians, dailyLogs, weeklyLogs] = await Promise.all([
    prisma.technician.findMany({
      where: { dealershipId, isActive: true, deletedAt: null },
      select: { id: true, name: true, d7Number: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.usageLog.groupBy({
      by: ['technicianId'],
      where: { ...usageWhere, createdAt: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.usageLog.groupBy({
      by: ['technicianId'],
      where: { ...usageWhere, createdAt: { gte: weekStart } },
      _count: { _all: true },
    }),
  ]);

  const dailyByTech = new Map(dailyLogs.map((row) => [row.technicianId, row._count._all]));
  const weeklyByTech = new Map(weeklyLogs.map((row) => [row.technicianId, row._count._all]));

  const summaries: TechnicianUsageSummary[] = technicians
    .map((tech) => ({
      technicianId: tech.id,
      name: tech.name,
      d7Number: tech.d7Number,
      role: tech.role,
      dailyCount: dailyByTech.get(tech.id) ?? 0,
      weeklyCount: weeklyByTech.get(tech.id) ?? 0,
    }))
    .sort((a, b) => b.dailyCount - a.dailyCount || b.weeklyCount - a.weeklyCount || a.name.localeCompare(b.name));

  return {
    dailyLimit: DAILY_USAGE_LIMIT,
    totalDailyUsage: summaries.reduce((sum, row) => sum + row.dailyCount, 0),
    technicians: summaries,
  };
}

export function getUsageTimezoneForHealth(): string {
  return getUsageTimezone();
}