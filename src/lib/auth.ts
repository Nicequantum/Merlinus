import 'server-only';

import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { normalizeD7Number } from './d7Number';
import { isTechnicianAccountActive } from './technicianAccounts';
import { prisma } from './db';
import { logger } from './logger';

/**
 * H-1 — Enterprise identity (Phase 1 accepted risk)
 *
 * Merlin Phase 1 uses D7 number + password authentication only.
 * SSO (SAML/OIDC) and MFA are NOT implemented in this module.
 *
 * Accepted for initial dealership pilot deployment with compensating controls:
 * - bcrypt password hashing (cost 12), sessionVersion revocation, 8-hour httpOnly cookies
 * - Manager-provisioned accounts and password reset via Settings
 * - Rate-limited login endpoint
 *
 * Planned Phase 2: corporate SSO (e.g. Entra ID) and MFA — track in enterprise roadmap.
 */

export const SESSION_COOKIE = 'benz_tech_session';
/** M9: shorter session lifetime reduces exposure from stolen cookies. */
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours
export const JWT_ISSUER = 'merlin';
export const JWT_AUDIENCE = 'benz-tech-session';

export interface SessionPayload {
  technicianId: string;
  d7Number: string;
  name: string;
  role: string;
  isAdmin: boolean;
  dealershipId: string;
  dealershipName: string;
  serviceAdvisorId: string | null;
  consentAt: string | null;
  consentVersion: string | null;
  legalDisclaimerAt: string | null;
  legalDisclaimerVersion: string | null;
  sessionVersion: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
    ...(maxAge === 0 ? { expires: new Date(0) } : {}),
  };
}

/** Attach session cookie to a Route Handler response (required — cookies().set() alone is dropped). */
export function applySessionCookieToResponse(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', sessionCookieOptions(0));
}

/** Build a Set-Cookie header that fully expires the session in the response. */
export function buildSessionClearCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export async function destroySession(technicianId?: string): Promise<void> {
  if (technicianId) {
    await revokeTechnicianSessions(technicianId);
  }
  await clearSessionCookie();
}

async function resolveSessionPayload(tokenPayload: SessionPayload): Promise<SessionPayload | null> {
  const tech = await prisma.technician.findUnique({
    where: { id: tokenPayload.technicianId },
    include: { dealership: true },
  });

  if (!tech || !isTechnicianAccountActive(tech)) return null;
  if (tech.sessionVersion !== tokenPayload.sessionVersion) return null;
  if (tech.role === 'service_advisor' && !tech.serviceAdvisorId) return null;

  return {
    technicianId: tech.id,
    d7Number: tech.d7Number,
    name: tech.name,
    role: tech.role,
    isAdmin: tech.isAdmin,
    dealershipId: tech.dealershipId,
    dealershipName: tech.dealership.name,
    serviceAdvisorId: tech.serviceAdvisorId ?? null,
    consentAt: tech.consentAt?.toISOString() ?? null,
    consentVersion: tech.consentVersion ?? null,
    legalDisclaimerAt: tech.legalDisclaimerAt?.toISOString() ?? null,
    legalDisclaimerVersion: tech.legalDisclaimerVersion ?? null,
    sessionVersion: tech.sessionVersion,
  };
}

function readSessionTokenFromRequest(request?: Request): string | undefined {
  if (!request) return undefined;
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1];
}

async function readSessionToken(request?: Request): Promise<string | undefined> {
  let token: string | undefined;

  try {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value;
  } catch {
    token = readSessionTokenFromRequest(request);
  }

  if (!token) {
    token = readSessionTokenFromRequest(request);
  }

  return token;
}

export async function getSessionContext(request?: Request): Promise<{
  session: SessionPayload | null;
  jwtPayload: SessionPayload | null;
}> {
  const token = await readSessionToken(request);
  if (!token) return { session: null, jwtPayload: null };

  const jwtPayload = await verifySessionToken(token);
  if (!jwtPayload) return { session: null, jwtPayload: null };

  const session = await resolveSessionPayload(jwtPayload);
  return { session, jwtPayload };
}

export async function getSession(request?: Request): Promise<SessionPayload | null> {
  const { session } = await getSessionContext(request);
  return session;
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function incrementSessionVersion(technicianId: string): Promise<number> {
  const updated = await prisma.technician.update({
    where: { id: technicianId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  logger.info('auth.session_version_incremented', { technicianId, sessionVersion: updated.sessionVersion });
  return updated.sessionVersion;
}

export async function revokeTechnicianSessions(technicianId: string): Promise<void> {
  await incrementSessionVersion(technicianId);
}

export async function loginTechnician(d7Number: string, password: string): Promise<SessionPayload | null> {
  const normalizedD7 = normalizeD7Number(d7Number);
  const tech = await prisma.technician.findUnique({
    where: { d7Number: normalizedD7 },
    include: { dealership: true },
  });
  if (!tech || !isTechnicianAccountActive(tech)) return null;
  if (tech.role === 'service_advisor' && !tech.serviceAdvisorId) return null;
  const valid = await verifyPassword(password, tech.passwordHash);
  if (!valid) return null;
  return {
    technicianId: tech.id,
    d7Number: tech.d7Number,
    name: tech.name,
    role: tech.role,
    isAdmin: tech.isAdmin,
    dealershipId: tech.dealershipId,
    dealershipName: tech.dealership.name,
    serviceAdvisorId: tech.serviceAdvisorId ?? null,
    consentAt: tech.consentAt?.toISOString() ?? null,
    consentVersion: tech.consentVersion ?? null,
    legalDisclaimerAt: tech.legalDisclaimerAt?.toISOString() ?? null,
    legalDisclaimerVersion: tech.legalDisclaimerVersion ?? null,
    sessionVersion: tech.sessionVersion,
  };
}