import { resolveDealerIdForWrite } from '@/lib/apex/dealerContext';
import { dealerIdWriteFields } from '@/lib/apex/dealerScope';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { hashPassword, revokeTechnicianSessions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiError, NOT_FOUND_ERROR, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { parseRequestBody, parseRouteParams, resetPasswordSchema, routeIdParamsSchema } from '@/lib/validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await parseRouteParams(routeIdParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id } = routeParams.data;

  return withAuth(
    request,
    async (session) => {
      const parsed = await parseRequestBody(request, resetPasswordSchema);
      if ('error' in parsed) return parsed.error;

      const user = await prisma.technician.findFirst({
        where: { id, dealershipId: session.dealershipId },
      });

      if (!user) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      const dealerFields = dealerIdWriteFields(resolveDealerIdForWrite({ session }));

      await prisma.technician.update({
        where: { id },
        data: { passwordHash, ...dealerFields },
      });

      await revokeTechnicianSessions(user.id);

      await writeAuditLog({
        action: 'user.password_reset',
        dealershipId: session.dealershipId,
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        entityType: 'technician',
        entityId: user.id,
        metadata: { d7Number: user.d7Number },
        ipAddress: getRequestIp(request),
      });

      return { ok: true };
    },
    { rateLimitKey: 'users.reset-password', requireManager: true }
  );
}