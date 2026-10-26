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
      throw new Error(`Missing env vars: SUPABASE_URL / SUPABASE_ANON_KEY`);
    }

    const request = getRequest();
    if (!request?.headers) throw new Error('Unauthorized: No request headers');

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized: Bearer token required');

    const token = authHeader.replace('Bearer ', '');
    if (!token || token.split('.').length !== 3) throw new Error('Unauthorized: Invalid token');

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw new Error('Unauthorized: Invalid or expired token');

    // Decode JWT payload without Buffer (works in Node.js, Cloudflare Workers, and Vercel Edge)
    const payloadBase64 = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = decodeURIComponent(
      atob(payloadBase64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const claims = JSON.parse(payloadJson);

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: { ...claims, sub: data.user.id, email: data.user.email },
      },
    });
  },
);
