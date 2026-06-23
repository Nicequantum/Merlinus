'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DealershipBranding } from '@/components/DealershipBranding';
import { toast } from 'sonner';

interface LoginViewProps {
  onLogin: (d7Number: string, password: string) => Promise<unknown>;
}

interface SecurityStatus {
  usingDefaultSeedPasswords: boolean;
  warnings: string[];
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [d7Number, setD7Number] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);

  useEffect(() => {
    fetch('/api/auth/security-status', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSecurityStatus(data as SecurityStatus);
      })
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onLogin(d7Number.trim().toUpperCase(), password);
      toast.success('Signed in');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="w-full max-w-sm">
        {securityStatus?.usingDefaultSeedPasswords && (
          <div className="mb-5 benz-card p-4 benz-alert-warn flex items-start gap-3">
            <AlertTriangle size={18} className="text-benz-amber mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-benz-amber">Default Seed Passwords Detected</p>
              <ul className="text-xs text-benz-secondary mt-1.5 leading-relaxed space-y-1 list-disc pl-4">
                {securityStatus.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="text-xs text-benz-muted mt-2">
                Rotate all seed account passwords in Settings before production use.
              </p>
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="benz-logo-ring w-20 h-20 mx-auto mb-5">
            <img src="/icon-512.png" alt="Merlin" className="w-full h-full rounded-[18px]" />
          </div>
          <DealershipBranding size="lg" />
        </div>

        <form onSubmit={handleSubmit} className="benz-card-elevated p-6 space-y-5">
          <div>
            <label className="benz-label">Mercedes-Benz D7 Number</label>
            <input
              type="text"
              value={d7Number}
              onChange={(e) => setD7Number(e.target.value.toUpperCase())}
              placeholder="D7HARRIH"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
              className="benz-input benz-input-mono uppercase"
            />
          </div>
          <div>
            <label className="benz-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="benz-input"
            />
          </div>
          <button type="submit" disabled={loading} className="primary-btn w-full h-12 text-sm font-semibold touch-target">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-benz-muted mt-6 leading-relaxed px-4">
          Authorized dealership personnel only.
        </p>
      </div>
    </div>
  );
}