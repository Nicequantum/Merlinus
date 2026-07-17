'use client';

import { useTranslation } from 'react-i18next';
import { ApexLogoMark } from '@/components/apex/ApexLogoMark';
import { CONSENT_VERSION } from '@/types';

interface ConsentModalProps {
  onAccept: () => void;
  loading?: boolean;
}

export function ConsentModal({ onAccept, loading }: ConsentModalProps) {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="benz-modal-overlay z-[100] p-4">
      <div className="benz-modal-panel sm:max-w-md w-full max-h-[90dvh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3.5 mb-5">
            <ApexLogoMark size="md" title="Apex" />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t('consentTitle')}</h2>
              <p className="text-xs text-benz-secondary mt-0.5">
                {t('consentVersion', { version: CONSENT_VERSION })}
              </p>
            </div>
          </div>

          <div className="text-sm text-benz-silver space-y-3.5 mb-6 leading-relaxed">
            <p>{t('consentBody1')}</p>
            <p>
              <strong className="text-benz-primary">{t('consentBody2Lead')}</strong>
              {t('consentBody2')}
            </p>
            <p>
              <strong className="text-benz-primary">{t('consentBody3Lead')}</strong>
              {t('consentBody3')}
            </p>
            <p className="text-xs text-benz-secondary">{t('consentBody4')}</p>
          </div>

          <button onClick={onAccept} disabled={loading} className="primary-btn w-full h-12 text-sm font-semibold touch-target">
            {loading ? tCommon('saving') : t('consentAgree')}
          </button>
        </div>
      </div>
    </div>
  );
}
