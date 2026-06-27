import type { RepairLineSoldMetrics } from '@/types';

type SoldMetricsRow = {
  soldLaborHours: number | null;
  soldLaborAmount: number | null;
  soldPartsAmount: number | null;
  customerApproved: boolean | null;
  isAddOn: boolean | null;
  soldMetricsUpdatedAt: Date | null;
};

export function mapSoldMetricsFromDb(line: SoldMetricsRow): RepairLineSoldMetrics {
  return {
    soldLaborHours: line.soldLaborHours,
    soldLaborAmount: line.soldLaborAmount,
    soldPartsAmount: line.soldPartsAmount,
    customerApproved: line.customerApproved,
    isAddOn: line.isAddOn,
    soldMetricsUpdatedAt: line.soldMetricsUpdatedAt?.toISOString() ?? null,
  };
}

export function lineSoldTotal(line: {
  soldLaborAmount: number | null;
  soldPartsAmount: number | null;
}): number {
  return (line.soldLaborAmount ?? 0) + (line.soldPartsAmount ?? 0);
}

export function hasSoldMetrics(line: RepairLineSoldMetrics): boolean {
  return (
    line.soldLaborHours != null ||
    line.soldLaborAmount != null ||
    line.soldPartsAmount != null ||
    line.customerApproved != null ||
    line.isAddOn != null
  );
}