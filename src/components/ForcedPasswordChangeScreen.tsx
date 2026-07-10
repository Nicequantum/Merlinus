'use client';

import { useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ApexLogoMark } from '@/components/apex/ApexLogoMark';
import { MerlinLogoMark } from '@/components/MerlinLogoMark';
import { api } from '@/lib/api';
import { isApexPlatformMode } from '@/lib/platformMode';

interface ForcedPasswordChangeScreenProps {
  userName?: string;
  rooftopName?: string;
  onCompleted: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}

const MIN_PASSWORD_LEN = 8;

export function ForcedPasswordChangeScreen({
  userName,
  rooftopName,
  onCompleted,
  onLogout,
}: ForcedPasswordChangeScreenProps) {
  const apex = isApexPlatformMode();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LEN) {
      toast.error(`New password must be at least ${MIN_PASSWORD_LEN} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('Choose a new password that is different from the temporary one');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      toast.success(
        result.requiresReauth
          ? 'Password updated — sign in with your new password'
          : 'Password updated'
      );
      await onCompleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onLogout();
    } catch {
      toast.error('Sign out failed');
    } finally {
      setSigningOut(false);
    }
  };

  const form = (
    <form onSubmit={handleSubmit} className={apex ? 'apex-login-form space-y-4' : 'space-y-3'}>
      <div className={apex ? 'apex-field' : undefined}>
        {apex ? (
          <label className="apex-label" htmlFor="forced-current-password">
            Temporary password
          </label>
        ) : null}
        <input
          id="forced-current-password"
          type="password"
          placeholder={apex ? '••••••••••••' : 'Temporary / current password'}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          className={apex ? 'apex-input' : 'benz-input'}
        />
      </div>
      <div className={apex ? 'apex-field' : undefined}>
        {apex ? (
          <label className="apex-label" htmlFor="forced-new-password">
            New password
          </label>
        ) : null}
        <input
          id="forced-new-password"
          type="password"
          placeholder={apex ? `At least ${MIN_PASSWORD_LEN} characters` : `New password (min ${MIN_PASSWORD_LEN})`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          required
          className={apex ? 'apex-input' : 'benz-input'}
        />
      </div>
      <div className={apex ? 'apex-field' : undefined}>
        {apex ? (
          <label className="apex-label" htmlFor="forced-confirm-password">
            Confirm new password
          </label>
        ) : null}
        <input
          id="forced-confirm-password"
          type="password"
          placeholder={apex ? 'Re-enter new password' : 'Confirm new password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          required
          className={apex ? 'apex-input' : 'benz-input'}
        />
      </div>

      <button
        type="submit"
        disabled={submitting || signingOut}
        className={
          apex
            ? 'apex-btn-primary w-full touch-target disabled:opacity-50'
            : 'primary-btn w-full h-12 text-sm font-semibold touch-target disabled:opacity-50'
        }
      >
        {submitting ? 'Updating…' : 'Set new password and continue'}
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
        {signingOut ? 'Signing out…' : 'Sign out instead'}
      </button>
    </form>
  );

  if (apex) {
    return (
      <div className="apex-login-shell" data-platform="apex" data-testid="forced-password-change">
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
                <span className="apex-wordmark-accent">Security gate</span>
              </p>
              <div className="apex-brand-divider" aria-hidden="true" />
              <p className="apex-brand-tagline">
                Temporary provision credentials cannot access dealership data. Choose a personal
                password known only to you.
              </p>
            </div>
            <ul className="apex-login-highlights">
              <li>
                <span className="apex-login-highlight-dot" aria-hidden="true" />
                All other API routes stay locked until this step
              </li>
              <li>
                <span className="apex-login-highlight-dot" aria-hidden="true" />
                Sessions are revoked after a successful change
              </li>
              <li>
                <span className="apex-login-highlight-dot" aria-hidden="true" />
                Password change is audited for compliance
              </li>
            </ul>
          </aside>

          <div className="apex-login-panel">
            <div className="apex-login-panel-header">
              <p className="apex-login-kicker">Required before workspace access</p>
              <h1 className="apex-login-title">Change your password</h1>
              <p className="apex-login-lead">
                {userName ? (
                  <>
                    Signed in as <strong>{userName}</strong>
                    {rooftopName ? (
                      <>
                        {' '}
                        · {rooftopName}
                      </>
                    ) : null}
                    . Enter the temporary password from onboarding, then set a permanent one.
                  </>
                ) : (
                  'Enter the temporary password from onboarding, then set a permanent one.'
                )}
              </p>
            </div>
            <div className="apex-card apex-card-accent p-5 sm:p-6">{form}</div>
            <p className="apex-login-footer">Authorized personnel only · Access is audited.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="benz-modal-overlay z-[100] p-4" data-testid="forced-password-change">
      <div className="benz-modal-panel sm:max-w-md w-full max-h-[90dvh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3.5 mb-5">
            <MerlinLogoMark size="md" />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Password change required</h2>
              <p className="text-xs text-benz-secondary mt-0.5">
                Temporary credentials must be rotated before bay use
              </p>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 mb-5">
            <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-benz-silver leading-relaxed">
              Your account was issued with a temporary password
              {userName ? (
                <>
                  {' '}
                  (<span className="text-benz-primary font-medium">{userName}</span>)
                </>
              ) : null}
              . Dealership data stays locked until you set a new password.
            </p>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <KeyRound size={16} className="text-benz-blue" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">Set a new password</span>
          </div>

          {form}
        </div>
      </div>
    </div>
  );
}
