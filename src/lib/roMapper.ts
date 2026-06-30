import type { ExtractedData, ImageAttachment, RepairLine, RepairOrder, StoryQualityResult } from '@/types';
import type { RepairLine as DbLine, RepairOrder as DbRO } from '@prisma/client';
import {
  decryptComplaintsPayload,
  decryptJsonObject,
  decryptOptionalSensitiveText,
  decryptPII,
  decryptSensitiveText,
  decryptStringArray,
  encryptComplaintsPayload,
  encryptJsonObject,
  encryptOptionalSensitiveText,
  encryptPII,
  encryptSensitiveText,
  encryptStringArray,
} from './encryption';
import { emptyExtractedData } from '@/utils/diagnosticParser';
import { mapStoryCertificationFromDbLine, storyCertificationMatchesStory } from './storyCertification';
import { mapSoldMetricsFromDb } from './repairLineSoldMetrics';
import { sanitizeForCDK } from './sanitizeForCDK';
import { buildImageProxyUrl, extractPathnameFromImageRef } from './imageUrls';
import { readAdvisorDisplayNameFromDb, readDescriptionFromDb, readRoNumberFromDb } from './piiFieldRead';
import { buildRoNumberSearchTokens } from './piiSearchToken';

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseImageAttachments(raw: string): ImageAttachment[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (typeof item === 'string') {
        const pathname = extractPathnameFromImageRef(item);
        if (!pathname) return null;
        return { id: `img-${pathname.slice(-12)}`, pathname, url: buildImageProxyUrl(pathname), name: 'image.jpg' };
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const pathname =
          typeof record.pathname === 'string'
            ? record.pathname
            : extractPathnameFromImageRef(typeof record.url === 'string' ? record.url : '');
        if (!pathname || !pathname.startsWith('benz-tech/')) return null;
        return {
          id: typeof record.id === 'string' ? record.id : `img-${Date.now()}`,
          pathname,
          url: buildImageProxyUrl(pathname),
          name: typeof record.name === 'string' ? record.name : 'image.jpg',
        };
      }
      return null;
    })
    .filter((img): img is ImageAttachment => img !== null);
}

export function normalizeImageAttachments(
  images?: Array<{ id: string; pathname?: string; url?: string; name: string }>
): ImageAttachment[] {
  return (images || [])
    .map((img) => {
      const pathname = img.pathname || extractPathnameFromImageRef(img.url || '');
      if (!pathname || !pathname.startsWith('benz-tech/')) return null;
      return {
        id: img.id,
        pathname,
        url: buildImageProxyUrl(pathname),
        name: img.name,
      };
    })
    .filter((img): img is ImageAttachment => img !== null);
}

export function sanitizeImageAttachments(images?: ImageAttachment[]): ImageAttachment[] {
  return (images || [])
    .filter((img) => img.pathname?.startsWith('benz-tech/'))
    .map((img) => ({
      id: img.id,
      pathname: img.pathname,
      url: buildImageProxyUrl(img.pathname),
      name: img.name,
    }));
}

export function imageAttachmentsToJson(images?: ImageAttachment[]): string {
  return JSON.stringify(
    sanitizeImageAttachments(images).map(({ id, pathname, name }) => ({ id, pathname, name }))
  );
}

type DbROWithAdvisor = DbRO & {
  repairLines: DbLine[];
  serviceAdvisor?: { id: string; displayNameEncrypted?: string } | null;
};

export function dbToRepairOrder(ro: DbROWithAdvisor): RepairOrder {
  const advisorName = ro.serviceAdvisorNameEncrypted
    ? decryptPII(ro.serviceAdvisorNameEncrypted)
    : undefined;

  const roNumber = readRoNumberFromDb(ro);

  const serviceAdvisorDisplayName = ro.serviceAdvisor
    ? readAdvisorDisplayNameFromDb(ro.serviceAdvisor)
    : undefined;

  return {
    id: ro.id,
    roNumber,
    vehicle: {
      vin: decryptPII(ro.vinEncrypted),
      year: ro.year,
      make: ro.make,
      model: ro.model,
      engine: ro.engine,
      mileageIn: ro.mileageIn,
      mileageOut: ro.mileageOut,
    },
    customer: { name: decryptPII(ro.customerNameEncrypted) },
    ...(() => {
      const payload = decryptComplaintsPayload(ro.complaintsEncrypted);
      return {
        complaints: payload.complaints,
        complaintLabels: payload.labels,
      };
    })(),
    serviceAdvisor: ro.serviceAdvisor
      ? {
          id: ro.serviceAdvisor.id,
          displayName: serviceAdvisorDisplayName || '',
          matchConfidence: ro.advisorMatchConfidence ?? undefined,
        }
      : undefined,
    serviceAdvisorName: advisorName || serviceAdvisorDisplayName,
    xentryImages: parseImageAttachments(ro.xentryImageUrls),
    xentryOcrTexts: decryptStringArray(ro.xentryOcrTextsEncrypted),
    repairLines: ro.repairLines.sort((a, b) => a.lineNumber - b.lineNumber).map(dbToRepairLine),
    createdAt: ro.createdAt.toISOString(),
    updatedAt: ro.updatedAt.toISOString(),
    technicianId: ro.technicianId,
    technicianName: undefined,
  };
}

export function dbToRepairLine(line: DbLine): RepairLine {
  const description = readDescriptionFromDb(line);

  return {
    id: line.id,
    lineNumber: line.lineNumber,
    description,
    customerConcern: decryptPII(line.customerConcernEncrypted),
    technicianNotes: decryptSensitiveText(line.technicianNotesEncrypted),
    xentryImages: parseImageAttachments(line.xentryImageUrls),
    xentryOcrTexts: decryptStringArray(line.xentryOcrTextsEncrypted),
    extractedData: decryptJsonObject<ExtractedData>(line.extractedDataEncrypted, emptyExtractedData()),
    warrantyStory: decryptOptionalSensitiveText(line.warrantyStoryEncrypted),
    storyQualityAudit: parseStoryQualityAudit(
      (line as DbLine & { storyQualityAuditEncrypted?: string }).storyQualityAuditEncrypted
    ),
    isCustomerPay: line.isCustomerPay ?? false,
    soldMetrics: mapSoldMetricsFromDb(
      line as DbLine & {
        soldLaborHours?: number | null;
        soldLaborAmount?: number | null;
        soldPartsAmount?: number | null;
        customerApproved?: boolean | null;
        isAddOn?: boolean | null;
        soldMetricsUpdatedAt?: Date | null;
      }
    ),
    storyCertification: (() => {
      const certification = mapStoryCertificationFromDbLine(
        line as DbLine & {
          storyCertifiedAt?: Date | null;
          storyCertifiedByTechnicianId?: string | null;
          storyCertifiedByNameEncrypted?: string;
          storyCertifiedHash?: string;
        }
      );
      const storyText = decryptOptionalSensitiveText(line.warrantyStoryEncrypted);
      if (!certification || !storyCertificationMatchesStory(certification, storyText)) {
        return null;
      }
      return certification;
    })(),
  };
}

function parseStoryQualityAudit(raw: string | undefined | null): StoryQualityResult | null {
  if (!raw?.trim()) return null;
  const parsed = decryptJsonObject<StoryQualityResult | null>(raw, null);
  if (!parsed || typeof parsed.score !== 'number') return null;
  return parsed;
}

export interface RepairOrderInput {
  roNumber: string;
  vehicle: {
    vin: string;
    year: string;
    make: string;
    model: string;
    engine?: string;
    mileageIn: string;
    mileageOut: string;
  };
  customer: { name: string };
  complaints: string[];
  complaintLabels?: string[];
  xentryImages?: ImageAttachment[];
  xentryOcrTexts?: string[];
  repairLines: RepairLine[];
}

export function repairOrderToDbFields(
  input: RepairOrderInput & { serviceAdvisorName?: string }
) {
  const roNumber = input.roNumber.trim();

  return {
    roNumberEncrypted: encryptPII(roNumber),
    roNumberSearchTokens: buildRoNumberSearchTokens(roNumber),
    vinEncrypted: encryptPII(input.vehicle.vin),
    year: input.vehicle.year,
    make: input.vehicle.make,
    model: input.vehicle.model,
    engine: input.vehicle.engine || '',
    mileageIn: input.vehicle.mileageIn,
    mileageOut: input.vehicle.mileageOut,
    customerNameEncrypted: encryptPII(input.customer.name),
    complaintsEncrypted: encryptComplaintsPayload(input.complaints, input.complaintLabels),
    xentryImageUrls: imageAttachmentsToJson(input.xentryImages),
    xentryOcrTextsEncrypted: encryptStringArray(input.xentryOcrTexts || []),
    ...(input.serviceAdvisorName
      ? { serviceAdvisorNameEncrypted: encryptPII(input.serviceAdvisorName) }
      : {}),
  };
}

export function repairLineToDbFields(line: RepairLine) {
  return {
    lineNumber: line.lineNumber,
    descriptionEncrypted: encryptSensitiveText(line.description),
    customerConcernEncrypted: encryptPII(line.customerConcern),
    technicianNotesEncrypted: encryptSensitiveText(line.technicianNotes),
    xentryImageUrls: imageAttachmentsToJson(line.xentryImages),
    xentryOcrTextsEncrypted: encryptStringArray(line.xentryOcrTexts || []),
    extractedDataEncrypted: encryptJsonObject(line.extractedData || emptyExtractedData()),
    warrantyStoryEncrypted: encryptOptionalSensitiveText(
      line.warrantyStory ? sanitizeForCDK(line.warrantyStory) : line.warrantyStory
    ),
    ...(line.storyQualityAudit !== undefined
      ? {
          storyQualityAuditEncrypted: line.storyQualityAudit
            ? encryptJsonObject(line.storyQualityAudit)
            : '',
        }
      : {}),
    isCustomerPay: line.isCustomerPay ?? false,
  };
}