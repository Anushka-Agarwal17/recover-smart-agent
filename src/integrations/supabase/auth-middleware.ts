import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env['SUPABASE_URL'];
    const SUPABASE_ANON_KEY =
      process.env['SUPABASE_ANON_KEY'] || process.env['SUPABASE_PUBLISHABLE_KEY'];

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_ANON_KEY ? ['SUPABASE_ANON_KEY'] : []),
      ];
      throw new Error(`Missing Supabase env var(s): ${missing.join(', ')}`);
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Bearer token required');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token || token.split('.').length !== 3) {
      throw new Error('Unauthorized: Invalid token');
    }

    // Create a Supabase client using the user's JWT as the auth token
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify the token by fetching the user
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error('Unauthorized: Invalid or expired token');
    }

    // Decode claims from JWT payload
    const payloadBase64 = token.split('.')[1]!;
    const payload = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf-8')
    );

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: { ...payload, sub: data.user.id, email: data.user.email },
      },
    });
  },
);
