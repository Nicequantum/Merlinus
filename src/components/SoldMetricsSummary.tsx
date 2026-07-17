'use client';

import { useTranslation } from 'react-i18next';
import { lineSoldTotal } from '@/lib/repairLineSoldMetrics';
import type { RepairLineSoldMetrics } from '@/types';

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function SoldMetricsSummary({
  metrics,
  compact = false,
}: {
  metrics: RepairLineSoldMetrics;
  compact?: boolean;
}) {
  const { t } = useTranslation('line');
  const total = lineSoldTotal(metrics);
  const yesNo = (value: boolean | null | undefined) =>
    value == null ? '—' : value ? t('soldYes') : t('soldNo');

  if (compact) {
    const parts = [
      total > 0 ? formatMoney(total) : null,
      metrics.soldLaborHours != null ? `${metrics.soldLaborHours}h ${t('soldLabor')}` : null,
      metrics.customerApproved === true
        ? t('soldYes')
        : metrics.customerApproved === false
          ? t('soldNo')
          : null,
      metrics.isAddOn ? t('soldParts') : null,
    ].filter(Boolean);

    if (parts.length === 0) return null;

    return (
      <div className="text-xs text-benz-secondary mt-1.5 leading-relaxed">
        {t('soldMetricsTitle')}: {parts.join(' · ')}
      </div>
    );
  }

  return (
    <div className="benz-card p-4">
      <div className="benz-section-title mb-3">{t('soldMetricsTitle')}</div>
      <div className="grid grid-cols-2 gap-2.5 text-sm">
        <div className="benz-list-row p-3">
          <div className="text-xs text-benz-secondary">{t('soldLabor')}</div>
          <div className="font-medium mt-1">{metrics.soldLaborHours ?? '—'}</div>
        </div>
        <div className="benz-list-row p-3">
          <div className="text-xs text-benz-secondary">{t('soldLabor')}</div>
          <div className="font-medium mt-1">{formatMoney(metrics.soldLaborAmount)}</div>
        </div>
        <div className="benz-list-row p-3">
          <div className="text-xs text-benz-secondary">{t('soldParts')}</div>
          <div className="font-medium mt-1">{formatMoney(metrics.soldPartsAmount)}</div>
        </div>
        <div className="benz-list-row p-3">
          <div className="text-xs text-benz-secondary">{t('soldMetricsTitle')}</div>
          <div className="font-medium mt-1">{formatMoney(total > 0 ? total : null)}</div>
        </div>
        <div className="benz-list-row p-3">
          <div className="text-xs text-benz-secondary">{t('soldYes')} / {t('soldNo')}</div>
          <div className="font-medium mt-1">{yesNo(metrics.customerApproved)}</div>
        </div>
        <div className="benz-list-row p-3">
          <div className="text-xs text-benz-secondary">{t('soldParts')}</div>
          <div className="font-medium mt-1">{yesNo(metrics.isAddOn)}</div>
        </div>
      </div>
    </div>
  );
}
