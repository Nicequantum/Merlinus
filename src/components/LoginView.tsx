'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DealershipBranding } from '@/components/DealershipBranding';
import { MerlinLogoMark } from '@/components/MerlinLogoMark';
import { isClerkSignInAvailable } from '@/lib/authModeClient';
import { toast } from 'sonner';

interface LoginViewProps {
  onLogin: (d7Number: string, password: string) => Promise<unknown>;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [d7Number, setD7Number] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const showClerkOption = isClerkSignInAvailable();

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
      <div className="login-panel">
        <div className="merlin-brand-hero login-brand">
          <MerlinLogoMark size="lg" animated />
          <p className="merlin-wordmark">
            Merlinus
            <span className="merlin-wordmark-accent">Warranty Intelligence</span>
          </p>
          <div className="merlin-brand-divider" aria-hidden="true" />
          <DealershipBranding size="lg" />
        </div>

        <form onSubmit={handleSubmit} className="login-form benz-card-elevated benz-card-elevated-accent">
          <div className="login-field">
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
          <div className="login-field">
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
          <button type="submit" disabled={loading} className="primary-btn login-submit-btn w-full touch-target">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {showClerkOption ? (
            <div className="login-alt-auth">
              <div className="login-alt-divider" aria-hidden="true">
                <span>or</span>
              </div>
              <Link href="/sign-in" className="secondary-btn login-clerk-btn w-full touch-target">
                Sign in with Clerk
              </Link>
            </div>
          ) : null}
        </form>

        <p className="login-footer">Authorized dealership personnel only.</p>
      </div>
    </div>
  );
}