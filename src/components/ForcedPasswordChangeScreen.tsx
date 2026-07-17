'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, KeyRound, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { ApexLogoMark } from '@/components/apex/ApexLogoMark';
import { api } from '@/lib/api';
import { isApexPlatformMode } from '@/lib/platformMode';

interface ForcedPasswordChangeScreenProps {
  userName?: string;
  rooftopName?: string;
  onCompleted: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}

/** Matches API changePasswordSchema min; provision CLI requires 12 for temp passwords. */
const MIN_PASSWORD_LEN = 8;
const RECOMMENDED_PASSWORD_LEN = 12;

function passwordStrengthLabel(
  password: string,
  t: (key: string) => string
): { label: string; score: 0 | 1 | 2 | 3 } {
  if (!password) return { label: t('forcedStrengthEnter'), score: 0 };
  let score = 0 as 0 | 1 | 2 | 3;
  if (password.length >= MIN_PASSWORD_LEN) score = 1;
  if (password.length >= RECOMMENDED_PASSWORD_LEN) score = 2;
  if (
    password.length >= RECOMMENDED_PASSWORD_LEN &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  ) {
    score = 3;
  }
  const labels = [
    t('forcedStrengthTooShort'),
    t('forcedStrengthAcceptable'),
    t('forcedStrengthStronger'),
    t('forcedStrengthStrong'),
  ] as const;
  return { label: labels[score], score };
}

export function ForcedPasswordChangeScreen({
  userName,
  rooftopName,
  onCompleted,
  onLogout,
}: ForcedPasswordChangeScreenProps) {
  const { t } = useTranslation('auth');
  const apex = isApexPlatformMode();
  const formId = useId();
  const currentRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [touched, setTouched] = useState({ new: false, confirm: false });

  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  const strength = useMemo(() => passwordStrengthLabel(newPassword, t), [newPassword, t]);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const differsFromTemp =
    newPassword.length > 0 && currentPassword.length > 0 && newPassword !== currentPassword;
  const longEnough = newPassword.length >= MIN_PASSWORD_LEN;
  const canSubmit =
    currentPassword.length > 0 && longEnough && matches && differsFromTemp && !submitting && !signingOut;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ new: true, confirm: true });

    if (!longEnough) {
      toast.error(t('forcedToastMin', { min: MIN_PASSWORD_LEN }));
      return;
    }
    if (!matches) {
      toast.error(t('forcedToastMismatch'));
      return;
    }
    if (!differsFromTemp) {
      toast.error(t('forcedToastSame'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      toast.success(
        result.requiresReauth ? t('forcedToastSuccessReauth') : t('forcedToastSuccess')
      );
      await onCompleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forcedToastFail'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onLogout();
    } catch {
      toast.error(t('forcedToastSignOutFail'));
    } finally {
      setSigningOut(false);
    }
  };

  const requirementRow = (ok: boolean, text: string) => (
    <li
      className={`flex items-center gap-2 text-xs ${
        ok ? (apex ? 'text-emerald-400/90' : 'text-emerald-500') : apex ? 'text-slate-400' : 'text-benz-muted'
      }`}
    >
      {ok ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
      <span>{text}</span>
    </li>
  );

  const form = (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className={apex ? 'apex-login-form space-y-4' : 'space-y-3'}
      noValidate
      aria-describedby={`${formId}-requirements`}
    >
      <div className={apex ? 'apex-field' : 'space-y-1.5'}>
        <label className={apex ? 'apex-label' : 'benz-label'} htmlFor="forced-current-password">
          {t('forcedTempLabel')}
        </label>
        <input
          ref={currentRef}
          id="forced-current-password"
          type="password"
          placeholder={apex ? '••••••••••••' : t('forcedTempPlaceholder')}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          className={apex ? 'apex-input' : 'benz-input'}
        />
      </div>
      <div className={apex ? 'apex-field' : 'space-y-1.5'}>
        <label className={apex ? 'apex-label' : 'benz-label'} htmlFor="forced-new-password">
          {t('forcedNewLabel')}
        </label>
        <input
          id="forced-new-password"
          type="password"
          placeholder={t('forcedNewPlaceholder', {
            min: MIN_PASSWORD_LEN,
            recommend: RECOMMENDED_PASSWORD_LEN,
          })}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onBlur={() => setTouched((prev) => ({ ...prev, new: true }))}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          required
          aria-invalid={touched.new && !longEnough}
          className={apex ? 'apex-input' : 'benz-input'}
        />
        {newPassword ? (
          <p
            className={`text-xs mt-1 ${
              strength.score >= 2
                ? apex
                  ? 'text-emerald-400/90'
                  : 'text-emerald-600'
                : apex
                  ? 'text-amber-300/90'
                  : 'text-amber-600'
            }`}
            aria-live="polite"
          >
            {t('forcedStrength', { label: strength.label })}
          </p>
        ) : null}
      </div>
      <div className={apex ? 'apex-field' : 'space-y-1.5'}>
        <label className={apex ? 'apex-label' : 'benz-label'} htmlFor="forced-confirm-password">
          {t('forcedConfirmLabel')}
        </label>
        <input
          id="forced-confirm-password"
          type="password"
          placeholder={t('forcedConfirmPlaceholder')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={() => setTouched((prev) => ({ ...prev, confirm: true }))}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          required
          aria-invalid={touched.confirm && !matches}
          className={apex ? 'apex-input' : 'benz-input'}
        />
        {touched.confirm && confirmPassword && !matches ? (
          <p className={`text-xs mt-1 ${apex ? 'text-rose-300' : 'text-red-500'}`} role="alert">
            {t('forcedMismatch')}
          </p>
        ) : null}
      </div>

      <ul id={`${formId}-requirements`} className="space-y-1.5 py-1" aria-label={t('forcedReqAria')}>
        {requirementRow(longEnough, t('forcedReqMin', { min: MIN_PASSWORD_LEN }))}
        {requirementRow(matches, t('forcedReqMatch'))}
        {requirementRow(differsFromTemp, t('forcedReqDifferent'))}
      </ul>

      <button
        type="submit"
        disabled={!canSubmit}
        className={
          apex
            ? 'apex-btn-primary w-full touch-target disabled:opacity-50'
            : 'primary-btn w-full h-12 text-sm font-semibold touch-target disabled:opacity-50'
        }
      >
        {submitting ? t('forcedSubmitting') : t('forcedSubmit')}
      </button>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={submitting || signingOut}
        className={
          apex
            ? 'w-full text-sm text-[var(--apex-muted,theme(colors.slate.400))] hover:underline py-2 disabled:opacity-50'
            : 'w-full text-sm text-benz-secondary hover:text-benz-primary py-2 disabled:opacity-50'
        }
      >
        {signingOut ? t('forcedSigningOut') : t('forcedSignOut')}
      </button>
    </form>
  );

  if (apex) {
    const apexLead = userName
      ? rooftopName
        ? t('forcedApexLeadNamedRooftop', { name: userName, rooftop: rooftopName })
        : t('forcedApexLeadNamed', { name: userName })
      : t('forcedApexLead');

    return (
      <div
        className="apex-login-shell"
        data-platform="apex"
        data-testid="forced-password-change"
        role="main"
        aria-labelledby="forced-password-title"
      >
        <div className="apex-ambient" aria-hidden="true">
          <div className="apex-ambient-grid" />
          <div className="apex-ambient-logo-wash" />
          <div className="apex-ambient-gauge apex-ambient-gauge--left" />
          <div className="apex-ambient-gauge apex-ambient-gauge--right" />
          <div className="apex-ambient-circuit" />
        </div>

        <div className="apex-login-layout">
          <aside className="apex-login-aside">
            <div className="apex-brand-hero apex-brand-hero--login">
              <ApexLogoMark size="xl" animated />
              <p className="apex-wordmark">
                Apex
                <span className="apex-wordmark-accent">{t('forcedApexWordmarkAccent')}</span>
              </p>
              <div className="apex-brand-divider" aria-hidden="true" />
              <p className="apex-brand-tagline">{t('forcedApexTagline')}</p>
            </div>
            <ul className="apex-login-highlights">
              <li>
                <span className="apex-login-highlight-dot" aria-hidden="true" />
                {t('forcedApexHighlight1')}
              </li>
              <li>
                <span className="apex-login-highlight-dot" aria-hidden="true" />
                {t('forcedApexHighlight2')}
              </li>
              <li>
                <span className="apex-login-highlight-dot" aria-hidden="true" />
                {t('forcedApexHighlight3')}
              </li>
            </ul>
          </aside>

          <div className="apex-login-panel">
            <div className="apex-login-panel-header">
              <p className="apex-login-kicker">{t('forcedApexKicker')}</p>
              <h1 id="forced-password-title" className="apex-login-title">
                {t('forcedApexTitle')}
              </h1>
              <p className="apex-login-lead">{apexLead}</p>
            </div>
            <div className="apex-card apex-card-accent p-5 sm:p-6">{form}</div>
            <p className="apex-login-footer">{t('forcedApexFooter')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="benz-modal-overlay z-[100] p-4"
      data-testid="forced-password-change"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forced-password-title"
    >
      <div className="benz-modal-panel sm:max-w-md w-full max-h-[90dvh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3.5 mb-5">
            <ApexLogoMark size="md" title="Apex" />
            <div>
              <h2 id="forced-password-title" className="text-lg font-semibold tracking-tight">
                {t('forcedTitle')}
              </h2>
              <p className="text-xs text-benz-secondary mt-0.5">
                {t('forcedSubtitle')}
                {rooftopName ? ` · ${rooftopName}` : ''}
              </p>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 mb-5">
            <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-benz-silver leading-relaxed">
              {userName
                ? t('forcedBannerNamed', { name: userName })
                : t('forcedBanner')}
            </p>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <KeyRound size={16} className="text-benz-blue" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">{t('forcedFormTitle')}</span>
          </div>

          {form}
        </div>
      </div>
    </div>
  );
}
