import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { createUserSchema, parseBody } from '@/lib/validation';

export async function GET(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const users = await prisma.technician.findMany({
        where: { dealershipId: session.dealershipId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          consentAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        users: users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          consentAt: u.consentAt?.toISOString() ?? null,
        })),
      };
    },
    { rateLimitKey: 'users.list', requireManager: true }
  );
}

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const body = await request.json();
      const parsed = parseBody(createUserSchema, body);
      if ('error' in parsed) {
        return apiError(VALIDATION_ERROR, 400);
      }

      const { email, name, password, role } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      const existing = await prisma.technician.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return apiError('An account with this email already exists.', 409);
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.technician.create({
        data: {
          email: normalizedEmail,
          name: name.trim(),
          passwordHash,
          role,
          isActive: true,
          dealershipId: session.dealershipId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      await writeAuditLog({
        action: 'user.create',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        entityType: 'technician',
        entityId: user.id,
        metadata: { email: user.email, role: user.role },
        ipAddress: getRequestIp(request),
      });

      return {
        user: { ...user, createdAt: user.createdAt.toISOString() },
      };
    },
    { rateLimitKey: 'users.create', requireManager: true }
  );
}