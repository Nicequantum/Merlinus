import { apiError, FORBIDDEN_ERROR } from './errors';

type SessionRole = { role: string };

/** Service advisors may view ROs but must not invoke Grok-backed extraction or story AI. */
export function blockServiceAdvisorAi(session: SessionRole) {
  if (session.role === 'service_advisor') {
    return apiError(FORBIDDEN_ERROR, 403);
  }
  return null;
}