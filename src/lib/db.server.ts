import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

export interface AuditInput {
  event_type: string;
  transaction_ref?: string | null;
  customer_id?: string | null;
  case_id?: string | null;
  actor?: string;
  action?: string | null;
  reason?: string | null;
  result?: string | null;
}

/** Append-only audit writes. Never exposed to the client for update/delete. */
export async function writeAudit(db: Db, userId: string, events: AuditInput[]): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((event) => ({
    user_id: userId,
    event_type: event.event_type,
    transaction_ref: event.transaction_ref ?? null,
    customer_id: event.customer_id ?? null,
    case_id: event.case_id ?? null,
    actor: event.actor ?? "system",
    action: event.action ?? null,
    reason: event.reason ?? null,
    result: event.result ?? null,
  }));
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await db.from("audit_events").insert(rows.slice(i, i + 400));
    if (error) console.error("[recoverai] audit write failed", error.message);
  }
}

export class AppError extends Error {}

/** Human-readable failure that is safe to surface in the UI. */
export function fail(message: string): never {
  throw new AppError(message);
}
