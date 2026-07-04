import { appendAuditLogInTransaction } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { getRequestIp } from '@/lib/rate-limit';
import { jsonWithFreshSessionCookie, toTechnicianSession } from '@/lib/sessionRefresh';
import { LEGAL_DISCLAIMER_VERSION } from '@/types';

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.technician.update({
          where: { id: session.technicianId },
          data: {
            legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION,
            legalDisclaimerAt: now,
          },
        });

        await appendAuditLogInTransaction(tx, {
          action: 'legalDisclaimer.accept',
          dealershipId: session.dealershipId,
          technicianId: session.technicianId,
          entityType: 'technician',
          entityId: session.technicianId,
          metadata: { legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION },
          ipAddress: getRequestIp(request),
        });
      });

      const refreshedSession = {
        ...session,
        legalDisclaimerAt: now.toISOString(),
        legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION,
      };

      return jsonWithFreshSessionCookie(
        {
          legalDisclaimerAt: now.toISOString(),
          legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION,
          session: toTechnicianSession(refreshedSession),
        },
        refreshedSession
      );
    },
    {
      rateLimitKey: 'legal_disclaimer',
      skipConsent: true,
      skipLegalDisclaimer: true,
    }
  );
}