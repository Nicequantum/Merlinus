import type { TechnicianSession } from '@/types';

/** Minimal auth fetch helpers — kept separate so the login shell never imports @/lib/api. */

export async function fetchCurrentSession(): Promise<TechnicianSession | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Session check failed (${res.status})`);
  }
  const data = (await res.json()) as { session?: TechnicianSession | null };
  return data.session ?? null;
}

export async function loginWithCredentials(
  d7Number: string,
  password: string
): Promise<TechnicianSession> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ d7Number, password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    session?: TechnicianSession;
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Login failed');
  }
  if (!data.session) {
    throw new Error('Login succeeded but no session was returned');
  }
  return data.session;
}

export async function logoutSession(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function acceptConsentSession(): Promise<TechnicianSession> {
  const res = await fetch('/api/consent', { method: 'POST', credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as {
    consentAt?: string;
    consentVersion?: string;
    session?: TechnicianSession;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || 'Could not save consent');
  if (data.session) return data.session;
  if (!data.consentAt) throw new Error('Consent accepted but no session was returned');
  throw new Error('Consent accepted but no session was returned');
}

export async function acceptLegalDisclaimerSession(): Promise<TechnicianSession> {
  const res = await fetch('/api/legal-disclaimer', { method: 'POST', credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as {
    legalDisclaimerAt?: string;
    legalDisclaimerVersion?: string;
    session?: TechnicianSession;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || 'Could not save legal acknowledgment');
  if (data.session) return data.session;
  if (!data.legalDisclaimerAt) {
    throw new Error('Legal disclaimer accepted but no session was returned');
  }
  throw new Error('Legal disclaimer accepted but no session was returned');
}