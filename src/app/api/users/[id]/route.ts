import { resolveDealerIdForWrite } from '@/lib/apex/dealerContext';
import { dealerIdWriteFields } from '@/lib/apex/dealerScope';
import { auditDealerIdFromSession, writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { revokeTechnicianSessions } from '@/lib/auth';
import { revokeTechnicianAuthSessions } from '@/lib/clerkSession';
import { prisma } from '@/lib/db';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { parseRequestBody, parseRouteParams, routeIdParamsSchema, updateUserSchema } from '@/lib/validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await parseRouteParams(routeIdParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id } = routeParams.data;

  return withAuth(
    request,
    async (session) => {
      const parsed = await parseRequestBody(request, updateUserSchema);
      if ('error' in parsed) return parsed.error;

      if (id === session.technicianId && !parsed.data.isActive) {
        return apiError('You cannot deactivate your own account.', 400);
      }

      const user = await prisma.technician.findFirst({
        where: { id, dealershipId: session.dealershipId },
      });

      if (!user) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      const dealerFields = dealerIdWriteFields(resolveDealerIdForWrite({ session }));

      const updated = await prisma.technician.update({
        where: { id },
        data: { isActive: parsed.data.isActive, ...dealerFields },
        select: {
          id: true,
          d7Number: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!parsed.data.isActive) {
        await revokeTechnicianAuthSessions(updated.id, () => revokeTechnicianSessions(updated.id));
      }

      await writeAuditLog({
        action: parsed.data.isActive ? 'user.reactivate' : 'user.deactivate',
        dealershipId: session.dealershipId,
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        entityType: 'technician',
        entityId: updated.id,
        metadata: { d7Number: updated.d7Number },
        ipAddress: getRequestIp(request),
      });

      return {
        user: { ...updated, createdAt: updated.createdAt.toISOString() },
      };
    },
    { rateLimitKey: 'users.update', requireManager: true }
  );
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await parseRouteParams(routeIdParamsSchema, params);
  if ('error' in routeParams) return routeParams.error;
  const { id } = routeParams.data;

  return withAuth(
    request,
    async (session) => {
      if (session.role !== 'manager' && !session.isAdmin) {
        return apiError(FORBIDDEN_ERROR, 403);
      }

      if (id === session.technicianId) {
        return apiError('You cannot delete your own account.', 400);
      }

      const user = await prisma.technician.findFirst({
        where: { id, dealershipId: session.dealershipId },
      });

      if (!user) {
        return apiError(NOT_FOUND_ERROR, 404);
      }

      if (user.deletedAt) {
        return { ok: true };
      }

      // Previous behavior (hard delete) — preserved for reference; replaced by soft delete below.
      // await prisma.$transaction([
      //   prisma.repairOrder.deleteMany({ where: { technicianId: id } }),
      //   prisma.technician.delete({ where: { id } }),
      // ]);

      const removedAt = new Date();
      const dealerFields = dealerIdWriteFields(resolveDealerIdForWrite({ session }));

      await prisma.technician.update({
        where: { id },
        data: { deletedAt: removedAt, isActive: false, ...dealerFields },
      });
      await revokeTechnicianAuthSessions(id, () => revokeTechnicianSessions(id));

      await writeAuditLog({
        action: 'user.delete',
        dealershipId: session.dealershipId,
        dealerId: auditDealerIdFromSession(session),
        technicianId: session.technicianId,
        entityType: 'technician',
        entityId: id,
        metadata: { d7Number: user.d7Number, name: user.name, role: user.role, softDelete: true, deletedAt: removedAt.toISOString() },
        ipAddress: getRequestIp(request),
      });

      return { ok: true };
    },
    { rateLimitKey: 'users.delete' }
  );
}