'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApexLogoMark } from '@/components/apex/ApexLogoMark';
import { LEGAL_DISCLAIMER_VERSION } from '@/types';

interface LegalDisclaimerModalProps {
  onAccept: () => void | Promise<void>;
  loading?: boolean;
}

export function LegalDisclaimerModal({ onAccept, loading }: LegalDisclaimerModalProps) {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const noScrollNeeded = el.scrollHeight <= el.clientHeight + 16;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
    setScrolledToBottom(noScrollNeeded || atBottom);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollPosition();
    const resizeObserver = new ResizeObserver(checkScrollPosition);
    resizeObserver.observe(el);
    el.addEventListener('scroll', checkScrollPosition, { passive: true });
    return () => {
      resizeObserver.disconnect();
      el.removeEventListener('scroll', checkScrollPosition);
    };
  }, [checkScrollPosition]);

  const canAccept = scrolledToBottom && acknowledged;

  return (
    <div className="benz-modal-overlay z-[100] p-4">
      <div className="benz-modal-panel sm:max-w-lg w-full max-h-[92dvh] flex flex-col">
        <div className="p-6 pb-4 shrink-0">
          <div className="flex items-center gap-3.5 mb-4">
            <ApexLogoMark size="md" title="Apex" />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t('legalTitle')}</h2>
              <p className="text-xs text-benz-secondary mt-0.5">
                {t('legalVersion', { version: LEGAL_DISCLAIMER_VERSION })}
              </p>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="px-6 overflow-y-auto flex-1 text-sm text-benz-silver space-y-4 leading-relaxed border-y border-benz-border/40"
        >
          <p>{t('legalP1', { lead: t('legalP1Lead') })}</p>

          <p>
            <strong className="text-benz-primary">{t('legalP2Lead')}</strong>
            {t('legalP2')}
          </p>

          <p>
            <strong className="text-benz-primary">{t('legalP3Lead')}</strong>
            {t('legalP3', { mid: t('legalP3Mid') })}
          </p>

          <p>
            <strong className="text-benz-primary">{t('legalP4Lead')}</strong>
            {t('legalP4')}
          </p>

          <p>
            <strong className="text-benz-primary">{t('legalP5Lead')}</strong>
            {t('legalP5', { mid: t('legalP5Mid') })}
          </p>

          <p>
            <strong className="text-benz-primary">{t('legalP6Lead')}</strong>
            {t('legalP6')}
          </p>

          <p className="text-xs text-benz-secondary pb-4">
            {t('legalFooter', { version: LEGAL_DISCLAIMER_VERSION })}
          </p>
        </div>

        <div className="p-6 pt-4 shrink-0 space-y-4">
          {!scrolledToBottom && (
            <p className="text-xs text-benz-secondary text-center">{t('legalScrollHint')}</p>
          )}

          <label className="flex items-start gap-3 cursor-pointer select-none touch-target">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={!scrolledToBottom}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-benz-border accent-benz-blue shrink-0"
            />
            <span className="text-sm text-benz-silver leading-snug">{t('legalCheckbox')}</span>
          </label>

          <button
            type="button"
            onClick={() => void onAccept()}
            disabled={!canAccept || loading}
            className="primary-btn w-full h-12 text-sm font-semibold touch-target disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? tCommon('saving') : t('legalAccept')}
          </button>
        </div>
      </div>
    </div>
  );
}
