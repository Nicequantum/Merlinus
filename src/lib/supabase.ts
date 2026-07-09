import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnvConfig, isSupabaseServiceConfigured } from '@/lib/supabaseEnv';

let serviceClient: SupabaseClient | null = null;

/**
 * APEX NATIONAL PLATFORM — server-side Supabase admin client (service role).
 * MERLINUS SINGLE-DEALER: returns null when Supabase is not configured.
 */
export function getSupabaseServiceClient(): SupabaseClient | null {
  if (!isSupabaseServiceConfigured()) return null;
  if (serviceClient) return serviceClient;

  const { url, serviceRoleKey } = getSupabaseEnvConfig();
  if (!url || !serviceRoleKey) return null;

  serviceClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return serviceClient;
}