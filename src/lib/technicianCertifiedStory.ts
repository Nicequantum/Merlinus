import 'server-only';

import { prisma } from './db';
import { logger } from './logger';
import { readRoNumberFromDb } from './piiFieldRead';

export interface RecordCertifiedStoryInput {
  dealershipId: string;
  technicianId: string;
  repairOrderId: string;
  repairLineId: string;
  roNumber: string;
  lineNumber: number;
  certifiedAt: Date;
  certifiedByName: string;
  promptVersion: string;
  auditLogId?: string;
}

export async function recordTechnicianCertifiedStory(input: RecordCertifiedStoryInput): Promise<void> {
  if (input.auditLogId) {
    const existing = await prisma.technicianCertifiedStory.findFirst({
      where: { auditLogId: input.auditLogId },
      select: { id: true },
    });
    if (existing) return;
  }

  await prisma.technicianCertifiedStory.create({
    data: {
      dealershipId: input.dealershipId,
      technicianId: input.technicianId,
      repairOrderId: input.repairOrderId,
      repairLineId: input.repairLineId,
      roNumber: input.roNumber,
      lineNumber: input.lineNumber,
      certifiedAt: input.certifiedAt,
      certifiedByName: input.certifiedByName,
      promptVersion: input.promptVersion,
      auditLogId: input.auditLogId ?? null,
    },
  });
}

function parseAuditMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Idempotent backfill from story.certify audit rows for dealerships with legacy data. */
export async function backfillCertifiedStoriesFromAudit(dealershipId: string): Promise<void> {
  try {
    const certifyLogs = await prisma.auditLog.findMany({
      where: {
        dealershipId,
        action: 'story.certify',
        technicianId: { not: null },
        entityId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        technicianId: true,
        entityId: true,
        metadata: true,
        promptVersion: true,
        createdAt: true,
      },
    });

    if (certifyLogs.length === 0) return;

    const existing = await prisma.technicianCertifiedStory.findMany({
      where: { dealershipId, auditLogId: { in: certifyLogs.map((log) => log.id) } },
      select: { auditLogId: true },
    });
    const existingIds = new Set(existing.map((row) => row.auditLogId));

    const repairOrderIds = [
      ...new Set(
        certifyLogs
          .map((log) => parseAuditMetadata(log.metadata).repairOrderId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ];

    const repairOrders =
      repairOrderIds.length > 0
        ? await prisma.repairOrder.findMany({
            where: { id: { in: repairOrderIds }, dealershipId },
            select: { id: true, roNumberEncrypted: true },
          })
        : [];
    const roNumberById = new Map(
      repairOrders.map((ro) => [ro.id, readRoNumberFromDb(ro)] as const)
    );

    for (const log of certifyLogs) {
      if (existingIds.has(log.id) || !log.technicianId || !log.entityId) continue;

      const meta = parseAuditMetadata(log.metadata);
      const repairOrderId = typeof meta.repairOrderId === 'string' ? meta.repairOrderId : null;
      if (!repairOrderId) continue;

      const roNumber = roNumberById.get(repairOrderId);
      if (!roNumber) continue;

      const lineNumber = typeof meta.lineNumber === 'number' ? meta.lineNumber : 0;
      const certifiedByName =
        typeof meta.certifiedByName === 'string' && meta.certifiedByName.trim()
          ? meta.certifiedByName.trim()
          : 'Unknown';
      const certifiedAt =
        typeof meta.certifiedAt === 'string' ? new Date(meta.certifiedAt) : log.createdAt;

      await prisma.technicianCertifiedStory.create({
        data: {
          dealershipId,
          technicianId: log.technicianId,
          repairOrderId,
          repairLineId: log.entityId,
          roNumber,
          lineNumber,
          certifiedAt,
          certifiedByName,
          promptVersion: log.promptVersion,
          auditLogId: log.id,
        },
      });
    }
  } catch (error) {
    logger.error('technician_certified_story.backfill_failed', {
      dealershipId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}