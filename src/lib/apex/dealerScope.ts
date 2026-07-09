/**
 * APEX NATIONAL PLATFORM — Prisma where-clause helpers for dealer scoping.
 * MERLINUS SINGLE-DEALER: no-op when dealerId is missing (dealershipId remains authoritative).
 */

export function withOptionalDealerId<T extends Record<string, unknown>>(
  where: T,
  dealerId: string | null | undefined
): T & { dealerId?: string } {
  if (!dealerId?.trim()) return where;
  return { ...where, dealerId: dealerId.trim() };
}