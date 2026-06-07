import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './db';

const SESSION_COOKIE = 'benz_tech_session';
const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

export interface SessionPayload {
  technicianId: string;
  email: string;
  name: string;
  role: string;
  dealershipId: string;
  dealershipName: string;
  consentAt: string | null;
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
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function loginTechnician(email: string, password: string): Promise<SessionPayload | null> {
  const tech = await prisma.technician.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { dealership: true },
  });
  if (!tech || !tech.isActive) return null;
  const valid = await verifyPassword(password, tech.passwordHash);
  if (!valid) return null;
  return {
    technicianId: tech.id,
    email: tech.email,
    name: tech.name,
    role: tech.role,
    dealershipId: tech.dealershipId,
    dealershipName: tech.dealership.name,
    consentAt: tech.consentAt?.toISOString() ?? null,
  };
}