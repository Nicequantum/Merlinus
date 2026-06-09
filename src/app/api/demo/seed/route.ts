import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { buildDemoRepairOrders } from '@/lib/demoData';
import { prisma } from '@/lib/db';
import { dbToRepairOrder, repairLineToDbFields, repairOrderToDbFields } from '@/lib/roMapper';
import { apiError } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const demoEnabled = process.env.DEMO_MODE === 'true';
      if (!demoEnabled) {
        return apiError('Demo data seeding is disabled in this environment.', 403);
      }

      const templates = buildDemoRepairOrders();
      const created = [];

      for (const template of templates) {
        const existing = await prisma.repairOrder.findFirst({
          where: { dealershipId: session.dealershipId, roNumber: template.roNumber },
        });
        if (existing) continue;

        const ro = await prisma.repairOrder.create({
          data: {
            ...repairOrderToDbFields(template),
            technicianId: session.technicianId,
            dealershipId: session.dealershipId,
            repairLines: {
              create: template.repairLines.map((line) => repairLineToDbFields(line)),
            },
          },
          include: { repairLines: true },
        });
        created.push(dbToRepairOrder(ro));
      }

      await writeAuditLog({
        action: 'demo.seed',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        metadata: { createdCount: created.length, skippedExisting: templates.length - created.length },
        ipAddress: getRequestIp(request),
      });

      return {
        createdCount: created.length,
        repairOrders: created,
        message:
          created.length > 0
            ? `Loaded ${created.length} synthetic demo repair order(s).`
            : 'Demo repair orders already exist — no new records created.',
      };
    },
    { rateLimitKey: 'demo.seed', rateLimit: { limit: 5, windowMs: 60_000 } }
  );
}