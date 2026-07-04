import 'server-only';

import { NextResponse } from 'next/server';
import {
  applySessionCookieToResponse,
  createSessionToken,
  type SessionPayload,
} from './auth';
import type { TechnicianSession } from '@/types';

export type ComplianceSessionFields = Pick<
  SessionPayload,
  'consentAt' | 'consentVersion' | 'legalDisclaimerAt' | 'legalDisclaimerVersion'
>;

/** True when JWT compliance claims differ from the authoritative DB session. */
export function complianceFieldsDiffer(
  jwt: ComplianceSessionFields,
  db: ComplianceSessionFields
): boolean {
  return (
    (jwt.consentAt ?? null) !== (db.consentAt ?? null) ||
    (jwt.consentVersion ?? null) !== (db.consentVersion ?? null) ||
    (jwt.legalDisclaimerAt ?? null) !== (db.legalDisclaimerAt ?? null) ||
    (jwt.legalDisclaimerVersion ?? null) !== (db.legalDisclaimerVersion ?? null)
  );
}

export function toTechnicianSession(payload: SessionPayload): TechnicianSession {
  return {
    technicianId: payload.technicianId,
    d7Number: payload.d7Number,
    name: payload.name,
    role: payload.role,
    isAdmin: payload.isAdmin,
    dealershipId: payload.dealershipId,
    dealershipName: payload.dealershipName,
    serviceAdvisorId: payload.serviceAdvisorId,
    consentAt: payload.consentAt,
    consentVersion: payload.consentVersion,
    legalDisclaimerAt: payload.legalDisclaimerAt,
    legalDisclaimerVersion: payload.legalDisclaimerVersion,
  };
}

/** Re-issue the session cookie when JWT compliance claims lag the authoritative DB session. */
export async function attachRefreshedSessionCookie(
  response: NextResponse,
  session: SessionPayload,
  jwtPayload: SessionPayload | null
): Promise<NextResponse> {
  if (!jwtPayload || complianceFieldsDiffer(jwtPayload, session)) {
    const token = await createSessionToken(session);
    applySessionCookieToResponse(response, token);
  }
  return response;
}

export async function jsonWithSessionCookie(
  body: Record<string, unknown>,
  session: SessionPayload,
  jwtPayload: SessionPayload | null = null
): Promise<NextResponse> {
  const response = NextResponse.json(body);
  return attachRefreshedSessionCookie(response, session, jwtPayload);
}

/** Always re-issue cookie — use after consent/disclaimer writes that change JWT claims. */
export async function jsonWithFreshSessionCookie(
  body: Record<string, unknown>,
  session: SessionPayload
): Promise<NextResponse> {
  const response = NextResponse.json(body);
  const token = await createSessionToken(session);
  applySessionCookieToResponse(response, token);
  return response;
}