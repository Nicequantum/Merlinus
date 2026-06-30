import { appendAuditLogInTransaction } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';

import { getRequestIp } from '@/lib/rate-limit';
import { CONSENT_VERSION } from '@/types';

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.technician.update({
          where: { id: session.technicianId },
          data: { consentAt: now, consentVersion: CONSENT_VERSION },
        });

        await appendAuditLogInTransaction(tx, {
          action: 'consent.accept',
          dealershipId: session.dealershipId,
          technicianId: session.technicianId,
          entityType: 'technician',
          entityId: session.technicianId,
          metadata: { consentVersion: CONSENT_VERSION },
          ipAddress: getRequestIp(request),
        });
      });

      return { consentAt: now.toISOString() };
    },
    { rateLimitKey: 'consent', skipConsent: true, skipLegalDisclaimer: true }
  );
}