'use client';

import { useState } from 'react';
import { DealershipBranding } from '@/components/DealershipBranding';
import { MerlinLogo } from '@/components/MerlinLogo';
import { toast } from 'sonner';

interface LoginViewProps {
  onLogin: (d7Number: string, password: string) => Promise<unknown>;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [d7Number, setD7Number] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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


        <div className="text-center mb-8">
          <div className="benz-logo-ring benz-logo-bubble w-20 h-20 mx-auto mb-5">
            <MerlinLogo />
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