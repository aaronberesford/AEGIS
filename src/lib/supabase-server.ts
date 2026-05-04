import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  const config = env();

  if (config.demoMode) {
    throw new AppError("Supabase is not used while DEMO_MODE=true.", {
      code: "SUPABASE_DISABLED_IN_DEMO",
      status: 400,
    });
  }

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new AppError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      {
        code: "SUPABASE_NOT_CONFIGURED",
        status: 500,
      },
    );
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return supabaseAdmin;
}
