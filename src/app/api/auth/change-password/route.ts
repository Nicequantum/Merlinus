import { resolveDealerIdForWrite } from '@/lib/apex/dealerContext';
import { dealerIdWriteFields } from '@/lib/apex/dealerScope';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { clearSessionCookie, hashPassword, revokeTechnicianSessions, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { changePasswordSchema, parseRequestBody } from '@/lib/validation';

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const parsed = await parseRequestBody(request, changePasswordSchema);
      if ('error' in parsed) return parsed.error;

      const tech = await prisma.technician.findFirst({
        where: { id: session.technicianId, dealershipId: session.dealershipId },
      });
      if (!tech) {
        return apiError('Account not found.', 404);
      }

      const valid = await verifyPassword(parsed.data.currentPassword, tech.passwordHash);
      if (!valid) {
        return apiError('Current password is incorrect.', 401);
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      const dealerFields = dealerIdWriteFields(resolveDealerIdForWrite({ session }));

      await prisma.technician.updateMany({
        where: { id: session.technicianId, dealershipId: session.dealershipId },
        data: { passwordHash, ...dealerFields },
      });

      await revokeTechnicianSessions(session.technicianId);

      await writeAuditLog({
        action: 'auth.password_change',
        dealershipId: session.dealershipId,
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        entityType: 'technician',
        entityId: session.technicianId,
        ipAddress: getRequestIp(request),
      });

      await clearSessionCookie();
      return { ok: true, requiresReauth: true };
    },
    { rateLimitKey: 'auth.change-password', rateLimit: { limit: 5, windowMs: 60_000 } }
  );
}