import { APEX_NATIONAL_DEALERSHIP_ID } from '@/lib/apex/platformConstants';
import { withAuth } from '@/lib/apiRoute';
import { isApexPlatformMode } from '@/lib/platformMode';
import { apiError } from '@/lib/errors';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  if (!isApexPlatformMode()) {
    return apiError('Owner dealerships are only available in apex platform mode.', 404);
  }

  return withAuth(
    request,
    async () => {
      // National sentinel never appears as an enterable rooftop (Phase 6.3).
      const dealerships = await prisma.dealership.findMany({
        where: { id: { not: APEX_NATIONAL_DEALERSHIP_ID } },
        select: {
          id: true,
          name: true,
          dealer: { select: { code: true } },
        },
        orderBy: { name: 'asc' },
      });

      return {
        dealerships: dealerships.map((dealership) => ({
          id: dealership.id,
          name: dealership.name,
          dealerCode: dealership.dealer?.code ?? null,
          isPrimary: false,
        })),
      };
    },
    {
      requireOwner: true,
      requireOwnerNational: true,
      rateLimitKey: 'owner.dealerships',
    }
  );
}