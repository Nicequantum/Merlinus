import { decryptPII } from '@/lib/encryption';
import { mapSoldMetricsFromDb, hasSoldMetrics } from '@/lib/repairLineSoldMetrics';
import type { AdvisorRepairOrderDetail, AdvisorRepairOrderSummary } from '@/types';

type AdvisorRoRow = {
  id: string;
  roNumber: string;
  year: string;
  make: string;
  model: string;
  updatedAt: Date;
  repairLines: Array<{
    id: string;
    lineNumber: number;
    description: string;
    descriptionEncrypted: string;
    soldLaborHours: number | null;
    soldLaborAmount: number | null;
    soldPartsAmount: number | null;
    customerApproved: boolean | null;
    isAddOn: boolean | null;
    soldMetricsUpdatedAt: Date | null;
  }>;
};

export function mapAdvisorRepairOrderSummary(ro: AdvisorRoRow): AdvisorRepairOrderSummary {
  const metricsCaptured = ro.repairLines.filter((line) =>
    hasSoldMetrics(mapSoldMetricsFromDb(line))
  ).length;

  return {
    id: ro.id,
    roNumber: ro.roNumber,
    vehicle: {
      year: ro.year,
      make: ro.make,
      model: ro.model,
    },
    lineCount: ro.repairLines.length,
    metricsCaptured,
    updatedAt: ro.updatedAt.toISOString(),
  };
}

export function mapAdvisorRepairOrderDetail(ro: AdvisorRoRow): AdvisorRepairOrderDetail {
  return {
    id: ro.id,
    roNumber: ro.roNumber,
    vehicle: {
      vin: '',
      year: ro.year,
      make: ro.make,
      model: ro.model,
      mileageIn: '',
      mileageOut: '',
    },
    lines: ro.repairLines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      description:
        line.description?.trim() ||
        (line.descriptionEncrypted ? decryptPII(line.descriptionEncrypted) : '') ||
        `Line ${line.lineNumber}`,
      soldMetrics: mapSoldMetricsFromDb(line),
    })),
  };
}