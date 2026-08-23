/**
 * RecoverAI recovery engine — pure, deterministic business logic.
 * Shared by server functions (authoritative) and used for typing on the client.
 * No randomness that isn't seeded: the same dataset always produces the same numbers.
 */

export const RECOVERY_ACTIONS = [
  "SMART_RETRY",
  "PAYMENT_REMINDER",
  "ALTERNATE_PAYMENT_METHOD",
  "CHECKOUT_REENGAGEMENT",
  "ESCALATE",
  "NO_ACTION",
] as const;
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

export const FAILURE_REASONS = [
  "insufficient_funds",
  "bank_declined",
  "network_error",
  "authentication_failed",
  "expired_card",
  "checkout_abandoned",
  "subscription_failed",
  "unknown",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet", "bank_transfer"] as const;

export type RiskLevel = "low" | "medium" | "high";
export type AttemptOutcome = "SUCCESS" | "FAILED" | "NO_RESPONSE" | "ESCALATED";
export type CaseStatus = "open" | "in_progress" | "recovered" | "stopped" | "escalated";

export const ACTION_LABELS: Record<RecoveryAction, string> = {
  SMART_RETRY: "Smart Retry",
  PAYMENT_REMINDER: "Payment Reminder",
  ALTERNATE_PAYMENT_METHOD: "Alternate Payment Suggestion",
  CHECKOUT_REENGAGEMENT: "Checkout Re-engagement",
  ESCALATE: "Escalation",
  NO_ACTION: "No Action",
};

export const ACTION_LIMITS = {
  SMART_RETRY: { max: 2, minDelayMinutes: 240 },
  PAYMENT_REMINDER: { max: 2, minDelayMinutes: 720 },
  ALTERNATE_PAYMENT_METHOD: { max: 1, minDelayMinutes: 480 },
  CHECKOUT_REENGAGEMENT: { max: 2, minDelayMinutes: 360 },
} as const;

export interface MerchantRules {
  max_retries: number;
  recovery_window_hours: number;
  min_recovery_probability: number;
  max_interventions: number;
  escalation_threshold_amount: number;
}

export const DEFAULT_RULES: MerchantRules = {
  max_retries: 2,
  recovery_window_hours: 168,
  min_recovery_probability: 35,
  max_interventions: 4,
  escalation_threshold_amount: 2000,
};

export interface CaseFeatures {
  amount: number;
  failure_reason: FailureReason | string | null;
  retry_count: number;
  reminder_count: number;
  reengagement_count: number;
  alt_method_count: number;
  previous_success_count: number;
  previous_failure_count: number;
  hours_since_failure: number;
  opted_out: boolean;
  status: CaseStatus;
}

/** Deterministic hash → [0,1) so simulated outcomes are reproducible per record. */
export function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}

/** Seeded PRNG (mulberry32) used for synthetic dataset generation. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REASON_WEIGHT: Record<string, number> = {
  insufficient_funds: 18,
  bank_declined: 24,
  network_error: 32,
  authentication_failed: 14,
  expired_card: -6,
  checkout_abandoned: 8,
  subscription_failed: 12,
  unknown: 0,
};

/** Recovery probability (0-100) derived only from available transaction/customer data. */
export function computeRecoveryProbability(f: CaseFeatures): number {
  const history = f.previous_success_count + f.previous_failure_count;
  const successRatio = history > 0 ? f.previous_success_count / history : 0.35;
  let p = 24 + successRatio * 42;
  p += REASON_WEIGHT[String(f.failure_reason ?? "unknown")] ?? 0;
  p -= f.retry_count * 9;
  p -= (f.reminder_count + f.reengagement_count + f.alt_method_count) * 5;
  p -= Math.min(18, f.hours_since_failure / 12);
  if (f.amount > 2000) p -= 6;
  if (f.previous_success_count >= 6) p += 6;
  if (f.opted_out) p -= 25;
  return Math.max(2, Math.min(97, Math.round(p)));
}

export function riskLevelFor(probability: number, amount: number): RiskLevel {
  const exposure = amount >= 1500 ? 1 : amount >= 500 ? 0.5 : 0;
  const score = (100 - probability) / 100 + exposure * 0.35;
  if (score >= 0.85) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export function priorityScore(amount: number, probability: number, hoursSince: number, attempts: number): number {
  const urgency = Math.max(0.2, 1 - hoursSince / 336);
  return Math.round(amount * (probability / 100) * urgency * Math.max(0.35, 1 - attempts * 0.2) * 100) / 100;
}

export function interventionCount(f: CaseFeatures): number {
  return f.retry_count + f.reminder_count + f.reengagement_count + f.alt_method_count;
}

/**
 * Hard stopping rules. Evaluated server-side before any action is executed.
 * Returns a machine-readable stop reason, or null when recovery may continue.
 */
export function evaluateStoppingRules(
  f: CaseFeatures,
  probability: number,
  rules: MerchantRules,
): string | null {
  if (f.status === "recovered") return "PAYMENT_ALREADY_SUCCEEDED";
  if (f.status === "escalated") return "CASE_ESCALATED";
  if (f.opted_out) return "CUSTOMER_OPTED_OUT";
  if (f.hours_since_failure > rules.recovery_window_hours) return "OUTSIDE_RECOVERY_WINDOW";
  if (f.retry_count >= rules.max_retries && f.reminder_count >= ACTION_LIMITS.PAYMENT_REMINDER.max)
    return "MAX_RETRY_COUNT_REACHED";
  if (interventionCount(f) >= rules.max_interventions) return "MAX_INTERVENTION_COUNT_REACHED";
  if (probability < rules.min_recovery_probability) return "RECOVERY_PROBABILITY_BELOW_THRESHOLD";
  return null;
}

export interface EngineDecision {
  diagnosis: string;
  recovery_probability: number;
  risk_level: RiskLevel;
  recommended_action: RecoveryAction;
  reason: string;
  next_attempt_at: string | null;
  stop_reason: string | null;
  confidence: number;
  source: "ai" | "rule_based_fallback";
}

/** Deterministic rule-based fallback used when the AI model is unavailable or invalid. */
export function fallbackDecision(f: CaseFeatures, rules: MerchantRules): EngineDecision {
  const probability = computeRecoveryProbability(f);
  const risk = riskLevelFor(probability, f.amount);
  const stop = evaluateStoppingRules(f, probability, rules);
  const isCheckout = f.failure_reason === "checkout_abandoned";

  let action: RecoveryAction;
  let reason: string;
  let delay = 0;

  if (stop) {
    action = stop === "CASE_ESCALATED" ? "ESCALATE" : "NO_ACTION";
    reason = `Automated recovery halted by guardrail: ${stop.toLowerCase().replace(/_/g, " ")}.`;
  } else if (f.amount >= rules.escalation_threshold_amount && probability < 60) {
    action = "ESCALATE";
    reason = `Amount of ${f.amount.toFixed(2)} exceeds the escalation threshold with only ${probability}% recovery probability, so a human review is safer than another automated attempt.`;
  } else if (isCheckout && f.reengagement_count < ACTION_LIMITS.CHECKOUT_REENGAGEMENT.max) {
    action = "CHECKOUT_REENGAGEMENT";
    delay = ACTION_LIMITS.CHECKOUT_REENGAGEMENT.minDelayMinutes;
    reason = `Checkout was abandoned rather than declined, and only ${f.reengagement_count} re-engagement attempt(s) have been made.`;
  } else if (probability >= 75 && f.retry_count < Math.min(rules.max_retries, ACTION_LIMITS.SMART_RETRY.max)) {
    action = "SMART_RETRY";
    delay = ACTION_LIMITS.SMART_RETRY.minDelayMinutes;
    reason = `Recovery probability is ${probability}% with ${f.retry_count} of ${rules.max_retries} retries used, and the failure reason suggests a temporary decline.`;
  } else if (probability >= 55 && f.reminder_count < ACTION_LIMITS.PAYMENT_REMINDER.max) {
    action = "PAYMENT_REMINDER";
    delay = ACTION_LIMITS.PAYMENT_REMINDER.minDelayMinutes;
    reason = `Recovery probability is ${probability}%; a reminder is a lower-friction intervention than another retry.`;
  } else if (probability >= 40 && f.alt_method_count < ACTION_LIMITS.ALTERNATE_PAYMENT_METHOD.max) {
    action = "ALTERNATE_PAYMENT_METHOD";
    delay = ACTION_LIMITS.ALTERNATE_PAYMENT_METHOD.minDelayMinutes;
    reason = `The failure reason is unlikely to clear on retry, so suggesting an alternate payment method has the best remaining chance at ${probability}%.`;
  } else {
    action = "ESCALATE";
    reason = `Bounded automated actions are exhausted or unsuitable at ${probability}% recovery probability.`;
  }

  return {
    diagnosis: buildDiagnosis(f, probability),
    recovery_probability: probability,
    risk_level: risk,
    recommended_action: action,
    reason,
    next_attempt_at: delay ? new Date(Date.now() + delay * 60_000).toISOString() : null,
    stop_reason: stop,
    confidence: Math.max(45, Math.min(92, 60 + Math.abs(probability - 50) / 2)),
    source: "rule_based_fallback",
  };
}

export function buildDiagnosis(f: CaseFeatures, probability: number): string {
  const reason = String(f.failure_reason ?? "unknown").replace(/_/g, " ");
  const historyPart =
    f.previous_success_count > 0
      ? `${f.previous_success_count} previous successful payment(s) and ${f.previous_failure_count} previous failure(s)`
      : "no previous successful payments on record";
  const potential = probability >= 65 ? "High" : probability >= 40 ? "Moderate" : "Low";
  return `${potential} recovery potential: the customer has ${historyPart}, the recorded reason is "${reason}", and ${f.retry_count} retry attempt(s) have been made ${Math.round(f.hours_since_failure)}h after the event.`;
}

/** Deterministic simulated outcome for a bounded action. */
export function simulateOutcome(
  seed: string,
  action: RecoveryAction,
  probability: number,
): AttemptOutcome {
  if (action === "ESCALATE") return "ESCALATED";
  if (action === "NO_ACTION") return "NO_RESPONSE";
  const modifier =
    action === "SMART_RETRY" ? 1.05 : action === "PAYMENT_REMINDER" ? 0.85 : action === "ALTERNATE_PAYMENT_METHOD" ? 0.75 : 0.7;
  const chance = Math.min(0.9, (probability / 100) * modifier);
  const roll = seededUnit(seed);
  if (roll < chance) return "SUCCESS";
  return roll < chance + 0.3 ? "NO_RESPONSE" : "FAILED";
}

export function counterFieldFor(action: RecoveryAction): keyof CaseFeatures | null {
  switch (action) {
    case "SMART_RETRY":
      return "retry_count";
    case "PAYMENT_REMINDER":
      return "reminder_count";
    case "CHECKOUT_REENGAGEMENT":
      return "reengagement_count";
    case "ALTERNATE_PAYMENT_METHOD":
      return "alt_method_count";
    default:
      return null;
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyPrecise(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
