import { DEFAULT_RULES, type MerchantRules } from "./recovery-engine";
import type { Db } from "./db.server";

export interface Workspace {
  merchantName: string;
  rules: MerchantRules;
  transactionCount: number;
}

/** Ensures the signed-in merchant has a profile and safe default recovery policy. */
export async function ensureWorkspace(db: Db, userId: string, email?: string): Promise<Workspace> {
  const [{ data: profile }, { data: settings }, { count }] = await Promise.all([
    db.from("profiles").select("merchant_name").eq("id", userId).maybeSingle(),
    db.from("merchant_settings").select("*").eq("user_id", userId).maybeSingle(),
    db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  let merchantName = profile?.merchant_name ?? null;
  if (!profile) {
    const derived = email ? `${email.split("@")[0]!.replace(/[._-]/g, " ")} Commerce` : "Demo Merchant";
    merchantName = derived.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
    await db.from("profiles").upsert({ id: userId, merchant_name: merchantName });
  }

  let rules: MerchantRules = settings
    ? {
        max_retries: settings.max_retries,
        recovery_window_hours: settings.recovery_window_hours,
        min_recovery_probability: settings.min_recovery_probability,
        max_interventions: settings.max_interventions,
        escalation_threshold_amount: Number(settings.escalation_threshold_amount),
      }
    : DEFAULT_RULES;

  if (!settings) {
    await db.from("merchant_settings").upsert({ user_id: userId, ...DEFAULT_RULES });
    rules = DEFAULT_RULES;
  }

  return { merchantName: merchantName ?? "Demo Merchant", rules, transactionCount: count ?? 0 };
}

export async function loadRules(db: Db, userId: string): Promise<MerchantRules> {
  const { data } = await db.from("merchant_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return DEFAULT_RULES;
  return {
    max_retries: data.max_retries,
    recovery_window_hours: data.recovery_window_hours,
    min_recovery_probability: data.min_recovery_probability,
    max_interventions: data.max_interventions,
    escalation_threshold_amount: Number(data.escalation_threshold_amount),
  };
}
