/** Dealership-local calendar day boundaries for RO list scoping (aligned with USAGE_TIMEZONE). */

export function getDealershipTimezone(): string {
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

/** UTC instant for midnight at the start of the current dealership-local day. */
export function getStartOfDealershipDay(date = new Date(), timeZone = getDealershipTimezone()): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  for (let offsetHours = -14; offsetHours <= 14; offsetHours++) {
    const candidate = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0, 0));
    const parts = zonedParts(candidate, timeZone);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === 0) {
      return candidate;
    }
  }
  const fallback = new Date(date);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

/** True when the RO was touched on or after dealership-local midnight today. */
export function isRepairOrderActiveToday(
  updatedAt: string | undefined,
  todayStartIso: string,
  createdAt?: string
): boolean {
  const stamp = updatedAt || createdAt;
  if (!stamp) return true;
  return new Date(stamp) >= new Date(todayStartIso);
}