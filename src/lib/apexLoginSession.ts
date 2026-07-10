import type { ApexDealershipOption } from '@/lib/apexDealershipOptions';
import type { TechnicianSession } from '@/types';

/** Minimal Apex auth fetch helpers — kept separate from @/lib/api (login shell bundle). */

export type ApexLoginDealershipOption = ApexDealershipOption & { isPrimary: boolean };

export type ApexLoginResult =
  | { status: 'success'; session: TechnicianSession }
  | {
      status: 'select_dealership';
      pendingToken: string;
      dealerships: ApexLoginDealershipOption[];
    };

type LoginResponseBody = {
  session?: TechnicianSession;
  requiresDealershipSelection?: boolean;
  pendingToken?: string;
  dealerships?: ApexLoginDealershipOption[];
  error?: string;
  message?: string;
};

export async function loginWithIdentifier(
  identifier: string,
  password: string
): Promise<ApexLoginResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ identifier: identifier.trim(), password }),
  });

  const data = (await res.json().catch(() => ({}))) as LoginResponseBody;
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Login failed');
  }

  if (data.requiresDealershipSelection && data.pendingToken && data.dealerships?.length) {
    return {
      status: 'select_dealership',
      pendingToken: data.pendingToken,
      dealerships: data.dealerships,
    };
  }

  if (!data.session) {
    throw new Error('Login succeeded but no session was returned');
  }

  return { status: 'success', session: data.session };
}

export async function selectDealershipSession(
  pendingToken: string,
  dealershipId: string,
  rememberAsDefault = false
): Promise<TechnicianSession> {
  const res = await fetch('/api/auth/select-dealership', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ pendingToken, dealershipId, rememberAsDefault }),
  });

  const data = (await res.json().catch(() => ({}))) as LoginResponseBody;
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Dealership selection failed');
  }

  if (!data.session) {
    throw new Error('Dealership selected but no session was returned');
  }

  return data.session;
}

type OwnerDealershipsResponse = {
  dealerships?: ApexDealershipOption[];
  error?: string;
  message?: string;
};

export async function fetchOwnerDealerships(): Promise<ApexDealershipOption[]> {
  const res = await fetch('/api/owner/dealerships', {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as OwnerDealershipsResponse;
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Could not load dealerships');
  }
  return data.dealerships ?? [];
}

export async function enterOwnerDealership(dealershipId: string): Promise<TechnicianSession> {
  const res = await fetch('/api/auth/enter-dealership', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ dealershipId }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    session?: TechnicianSession;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || data.message || 'Could not enter dealership');
  }

  if (!data.session) {
    throw new Error('Dealership entered but no session was returned');
  }

  return data.session;
}

export async function exitOwnerDealership(): Promise<TechnicianSession> {
  const res = await fetch('/api/auth/exit-dealership', {
    method: 'POST',
    credentials: 'include',
  });

  const data = (await res.json().catch(() => ({}))) as {
    session?: TechnicianSession;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || data.message || 'Could not exit dealership');
  }

  if (!data.session) {
    throw new Error('Dealership exited but no session was returned');
  }

  return data.session;
}