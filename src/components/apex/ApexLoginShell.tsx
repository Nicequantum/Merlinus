'use client';

import { useState } from 'react';
import { ApexDealershipSelector } from '@/components/apex/ApexDealershipSelector';
import { ApexLogoMark } from '@/components/apex/ApexLogoMark';
import type { ApexLoginDealershipOption } from '@/lib/apexLoginSession';
import { toast } from 'sonner';

export type ApexLoginShellResult =
  | { status: 'success' }
  | { status: 'select_dealership'; pendingToken: string; dealerships: ApexLoginDealershipOption[] };

interface ApexLoginShellProps {
  onLogin: (identifier: string, password: string) => Promise<ApexLoginShellResult>;
  onSelectDealership: (
    pendingToken: string,
    dealershipId: string,
    rememberAsDefault?: boolean
  ) => Promise<void>;
}

type LoginStep = 'credentials' | 'dealership';

export function ApexLoginShell({ onLogin, onSelectDealership }: ApexLoginShellProps) {
  const [step, setStep] = useState<LoginStep>('credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [dealerships, setDealerships] = useState<ApexLoginDealershipOption[]>([]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await onLogin(identifier.trim(), password);
      if (result.status === 'select_dealership') {
        setPendingToken(result.pendingToken);
        setDealerships(result.dealerships);
        setStep('dealership');
        return;
      }
      toast.success('Signed in');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDealershipSelect = async (
    dealershipId: string,
    options: { rememberAsDefault: boolean }
  ) => {
    if (!pendingToken) return;
    setLoading(true);
    try {
      await onSelectDealership(pendingToken, dealershipId, options.rememberAsDefault);
      toast.success('Dealership selected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not select dealership');
    } finally {
      setLoading(false);
    }
  };

  const resetToCredentials = () => {
    setStep('credentials');
    setPendingToken(null);
    setDealerships([]);
    setPassword('');
  };

  return (
    <div className="apex-login-shell" data-platform="apex">
      <div className="apex-login-panel">
        <div className="apex-brand-hero">
          <ApexLogoMark size="lg" animated />
          <p className="apex-wordmark">
            Apex
            <span className="apex-wordmark-accent">National Platform</span>
          </p>
          <div className="apex-brand-divider" aria-hidden="true" />
          <p className="apex-brand-tagline">
            Unified access for national operations and dealership rooftops.
          </p>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentialsSubmit} className="apex-login-form apex-card apex-card-accent">
            <div className="apex-field">
              <label className="apex-label" htmlFor="apex-identifier">
                Email, D7, or Username
              </label>
              <input
                id="apex-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="owner@apex.com · D7HARRIH · brand.name"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
                className="apex-input"
              />
              <p className="apex-hint">Owners sign in with email. Technicians use D7 or Apex username.</p>
            </div>
            <div className="apex-field">
              <label className="apex-label" htmlFor="apex-password">
                Password
              </label>
              <input
                id="apex-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="apex-input"
              />
            </div>
            <button type="submit" disabled={loading} className="apex-btn-primary w-full touch-target">
              {loading ? 'Authenticating…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <div className="apex-login-form apex-card apex-card-accent">
            <ApexDealershipSelector
              dealerships={dealerships}
              loading={loading}
              showRememberDefault
              onSelect={handleDealershipSelect}
              onBack={resetToCredentials}
              backLabel="Back to sign in"
            />
          </div>
        )}

        <p className="apex-login-footer">Authorized personnel only · All access is audited.</p>
      </div>
    </div>
  );
}