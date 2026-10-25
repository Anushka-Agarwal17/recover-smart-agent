import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseClient() {
  const SUPABASE_URL =
    import.meta.env['VITE_SUPABASE_URL'] ||
    (typeof process !== 'undefined' ? process.env['SUPABASE_URL'] : undefined);

  const SUPABASE_ANON_KEY =
    import.meta.env['VITE_SUPABASE_ANON_KEY'] ||
    (typeof process !== 'undefined' ? process.env['SUPABASE_ANON_KEY'] : undefined);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['VITE_SUPABASE_URL'] : []),
      ...(!SUPABASE_ANON_KEY ? ['VITE_SUPABASE_ANON_KEY'] : []),
    ];
    throw new Error(
      `Missing Supabase environment variable(s): ${missing.join(', ')}.\n` +
      `Copy .env.local.example to .env.local and fill in your project values.`,
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
