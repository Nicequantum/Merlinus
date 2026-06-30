import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encryptPII } from '@/lib/encryption';
import { readAdvisorDisplayNameFromDb } from '@/lib/piiFieldRead';
import {
  fingerprintAdvisorName,
  isPlausibleAdvisorName,
  normalizeAdvisorDisplayName,
} from './nameUtils';

export interface ResolvedServiceAdvisor {
  id: string;
  displayName: string;
  nameFingerprint: string;
  matchConfidence: number;
  isNew: boolean;
  matchedViaAlias: boolean;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

function confidenceForMatch(opts: { exact: boolean; alias: boolean }): number {
  if (opts.exact) return 0.98;
  if (opts.alias) return 0.9;
  return 0.75;
}

async function recordAlias(
  client: DbClient,
  serviceAdvisorId: string,
  aliasText: string,
  aliasFingerprint: string
) {
  const existing = await client.serviceAdvisorAlias.findUnique({
    where: {
      serviceAdvisorId_aliasFingerprint: {
        serviceAdvisorId,
        aliasFingerprint,
      },
    },
  });

  if (existing) {
    await client.serviceAdvisorAlias.update({
      where: { id: existing.id },
      data: { hitCount: { increment: 1 }, lastSeenAt: new Date(), aliasText },
    });
    return;
  }

  // S2 PLAINTEXT WRITE: aliasText has no encrypted twin column yet (see schema migration plan).
  await client.serviceAdvisorAlias.create({
    data: { serviceAdvisorId, aliasText, aliasFingerprint },
  });
}

export interface ResolveServiceAdvisorOptions {
  /** When false, links an RO without incrementing roCount (e.g. re-save of same RO). */
  incrementRoCount?: boolean;
}

export async function resolveServiceAdvisor(
  dealershipId: string,
  rawName: string,
  client: DbClient = prisma,
  options: ResolveServiceAdvisorOptions = {}
): Promise<ResolvedServiceAdvisor | null> {
  const incrementRoCount = options.incrementRoCount !== false;
  const displayName = normalizeAdvisorDisplayName(rawName);
  const nameFingerprint = fingerprintAdvisorName(displayName || rawName);
  if (!nameFingerprint || !isPlausibleAdvisorName(displayName || rawName)) {
    return null;
  }

  const byFingerprint = await client.serviceAdvisor.findUnique({
    where: {
      dealershipId_nameFingerprint: {
        dealershipId,
        nameFingerprint,
      },
    },
  });

  if (byFingerprint && byFingerprint.status === 'active' && !byFingerprint.deletedAt) {
    const storedDisplayName = readAdvisorDisplayNameFromDb(byFingerprint);
    if (displayName && displayName !== storedDisplayName) {
      await recordAlias(client, byFingerprint.id, displayName, nameFingerprint);
    }

    const updated = await client.serviceAdvisor.update({
      where: { id: byFingerprint.id },
      data: {
        lastSeenAt: new Date(),
        ...(incrementRoCount ? { roCount: { increment: 1 } } : {}),
      },
    });

    return {
      id: updated.id,
      displayName: readAdvisorDisplayNameFromDb(updated),
      nameFingerprint: updated.nameFingerprint,
      matchConfidence: confidenceForMatch({ exact: true, alias: false }),
      isNew: false,
      matchedViaAlias: false,
    };
  }

  const aliasHit = await client.serviceAdvisorAlias.findFirst({
    where: {
      aliasFingerprint: nameFingerprint,
      serviceAdvisor: { dealershipId, status: 'active', deletedAt: null },
    },
    include: { serviceAdvisor: true },
  });

  if (aliasHit?.serviceAdvisor) {
    await recordAlias(client, aliasHit.serviceAdvisorId, displayName || rawName, nameFingerprint);
    const updated = await client.serviceAdvisor.update({
      where: { id: aliasHit.serviceAdvisorId },
      data: {
        lastSeenAt: new Date(),
        ...(incrementRoCount ? { roCount: { increment: 1 } } : {}),
      },
    });

    return {
      id: updated.id,
      displayName: readAdvisorDisplayNameFromDb(updated),
      nameFingerprint: updated.nameFingerprint,
      matchConfidence: confidenceForMatch({ exact: false, alias: true }),
      isNew: false,
      matchedViaAlias: true,
    };
  }

  const advisorLabel = displayName || rawName.trim();

  const created = await client.serviceAdvisor.create({
    data: {
      dealershipId,
      displayNameEncrypted: encryptPII(advisorLabel),
      nameFingerprint,
      roCount: incrementRoCount ? 1 : 0,
      aliases: {
        create: {
          aliasText: displayName || rawName.trim(),
          aliasFingerprint: nameFingerprint,
        },
      },
      profile: {
        create: {
          profileData: JSON.stringify({
            formatting: {},
            abbreviations: {},
            commonPhrases: [],
            vehicleAffinities: {},
            complaintCategories: {},
            extractionHints: [],
          }),
        },
      },
    },
  });

  return {
    id: created.id,
    displayName: readAdvisorDisplayNameFromDb(created),
    nameFingerprint: created.nameFingerprint,
    matchConfidence: confidenceForMatch({ exact: false, alias: false }),
    isNew: true,
    matchedViaAlias: false,
  };
}