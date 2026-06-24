import { withAuth } from '@/lib/apiRoute';
import { checkSeedPasswordSecurity } from '@/lib/seedSecurity';

export const dynamic = 'force-dynamic';

/**
 * C4: Manager-only — seed password hygiene must not be probeable before authentication.
 */
export async function GET(request: Request) {
  return withAuth(
    request,
    async () => {
      const status = await checkSeedPasswordSecurity();
      return Response.json(
        {
          usingDefaultSeedPasswords: status.usingDefaultSeedPasswords,
          warnings: status.warnings,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    },
    { rateLimitKey: 'auth.security-status', requireManager: true }
  );
}