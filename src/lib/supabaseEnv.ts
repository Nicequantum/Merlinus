/**
 * APEX NATIONAL PLATFORM — Supabase environment helpers (Phase 1 foundation).
 * MERLINUS SINGLE-DEALER: Supabase vars are optional; Prisma continues via DATABASE_URL.
 */

export interface SupabaseEnvConfig {
  url: string | null;
  anonKey: string | null;
  serviceRoleKey: string | null;
  isConfigured: boolean;
  isServiceConfigured: boolean;
}

export function getSupabaseEnvConfig(): SupabaseEnvConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;

  return {
    url,
    anonKey,
    serviceRoleKey,
    isConfigured: Boolean(url && anonKey),
    isServiceConfigured: Boolean(url && serviceRoleKey),
  };
}

/** True when Apex national platform Supabase project vars are present. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseEnvConfig().isConfigured;
}

/** Server-side admin client requires service role key — never expose to the browser. */
export function isSupabaseServiceConfigured(): boolean {
  return getSupabaseEnvConfig().isServiceConfigured;
}