import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { LEGAL_DISCLAIMER_VERSION } from '@/types';

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const now = new Date();

      await prisma.technician.update({
        where: { id: session.technicianId },
        data: { legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION },
      });

      await prisma.technician.updateMany({
        where: { id: session.technicianId, legalDisclaimerAt: null },
        data: { legalDisclaimerAt: now },
      });

      const technician = await prisma.technician.findUnique({
        where: { id: session.technicianId },
        select: { legalDisclaimerAt: true, legalDisclaimerVersion: true },
      });

      return {
        legalDisclaimerAt: technician?.legalDisclaimerAt?.toISOString() ?? now.toISOString(),
        legalDisclaimerVersion: technician?.legalDisclaimerVersion ?? LEGAL_DISCLAIMER_VERSION,
      };
    },
    { rateLimitKey: 'legal_disclaimer', skipConsent: false }
  );
}