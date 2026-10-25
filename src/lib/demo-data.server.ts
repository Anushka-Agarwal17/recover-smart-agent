import {
  FAILURE_REASONS,
  PAYMENT_METHODS,
  computeRecoveryProbability,
  fallbackDecision,
  makeRng,
  priorityScore,
  riskLevelFor,
  seededUnit,
  simulateOutcome,
  counterFieldFor,
  type CaseFeatures,
  type FailureReason,
  type MerchantRules,
} from "./recovery-engine";
import { writeAudit, type Db } from "./db.server";

const FIRST = [
  "Aarav", "Maya", "Elena", "Noah", "Priya", "Lucas", "Sofia", "Ethan", "Aisha", "Mateo",
  "Nina", "Omar", "Clara", "Jonas", "Leah", "Kenji", "Ruth", "Ivan", "Zara", "Diego",
  "Hana", "Marcus", "Yuki", "Amira", "Tomas", "Grace", "Felix", "Nadia", "Oscar", "Isla",
];
const LAST = [
  "Kapoor", "Lindqvist", "Moreau", "Okafor", "Silva", "Novak", "Haddad", "Tanaka", "Fischer", "Rossi",
  "Ahmed", "Weber", "Torres", "Nilsen", "Costa", "Petrov", "Dlamini", "Meyer", "Kim", "Bauer",
];
const DOMAINS = ["northloop.io", "vela.co", "brightsend.com", "orbitmail.com", "kestrel.dev"];

type Pattern = "loyal" | "steady" | "new" | "at_risk";

interface CustomerSpec {
  external_id: string;
  name: string;
  email: string;
  lifetime_value: number;
  previous_success_count: number;
  previous_failure_count: number;
  risk_level: string;
  opted_out: boolean;
  pattern: Pattern;
}

interface TxSpec {
  transaction_ref: string;
  customerIdx: number;
  amount: number;
  currency: string;
  occurred_at: string;
  payment_method: string;
  status: string;
  failure_reason: FailureReason | null;
  retry_count: number;
  checkout_status: string | null;
  subscription_status: string | null;
  recovery_probability: number;
  recovery_status: string;
  hoursSince: number;
}

const CUSTOMER_COUNT = 120;
const TX_COUNT = 720;
const SEED = 20260823;

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function buildCustomers(rng: () => number): CustomerSpec[] {
  const out: CustomerSpec[] = [];
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const patternRoll = rng();
    const pattern: Pattern =
      patternRoll < 0.28 ? "loyal" : patternRoll < 0.62 ? "steady" : patternRoll < 0.85 ? "new" : "at_risk";
    const success =
      pattern === "loyal"
        ? 8 + Math.floor(rng() * 18)
        : pattern === "steady"
          ? 3 + Math.floor(rng() * 6)
          : pattern === "new"
            ? Math.floor(rng() * 2)
            : 1 + Math.floor(rng() * 3);
    const failures =
      pattern === "at_risk" ? 3 + Math.floor(rng() * 5) : pattern === "loyal" ? Math.floor(rng() * 2) : Math.floor(rng() * 3);
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    const avgOrder = 40 + Math.floor(rng() * 460);
    out.push({
      external_id: `CUS-${(1000 + i).toString()}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${pick(rng, DOMAINS)}`,
      lifetime_value: Math.round(success * avgOrder * 100) / 100,
      previous_success_count: success,
      previous_failure_count: failures,
      risk_level: pattern === "at_risk" ? "high" : pattern === "new" ? "medium" : "low",
      opted_out: rng() < 0.04,
      pattern,
    });
  }
  return out;
}

function buildTransactions(rng: () => number, customers: CustomerSpec[], now: number): TxSpec[] {
  const out: TxSpec[] = [];
  for (let i = 0; i < TX_COUNT; i++) {
    const customerIdx = Math.floor(rng() * customers.length);
    const customer = customers[customerIdx]!;
    const hoursSince = Math.round(rng() * 24 * 58) + 1;
    const occurred = new Date(now - hoursSince * 3_600_000);
    const amount = Math.round((15 + rng() * (customer.pattern === "loyal" ? 2600 : 1200)) * 100) / 100;

    const roll = rng();
    let status: string;
    let failureReason: FailureReason | null = null;
    let checkout: string | null = null;
    let subscription: string | null = null;

    const failureBias = customer.pattern === "at_risk" ? 0.16 : customer.pattern === "loyal" ? -0.06 : 0;
    if (roll < 0.6 - failureBias) {
      status = "SUCCESS";
      checkout = "completed";
    } else if (roll < 0.79 - failureBias) {
      status = "FAILED";
      failureReason = pick(rng, [
        "insufficient_funds",
        "bank_declined",
        "network_error",
        "authentication_failed",
        "expired_card",
        "unknown",
      ] as const);
      checkout = "completed";
    } else if (roll < 0.89) {
      status = "ABANDONED";
      failureReason = "checkout_abandoned";
      checkout = "abandoned";
    } else if (roll < 0.96) {
      status = "FAILED";
      failureReason = "subscription_failed";
      subscription = "past_due";
      checkout = "completed";
    } else {
      status = "PENDING";
      checkout = "pending";
    }

    out.push({
      transaction_ref: `TXN-${SEED}-${(10000 + i).toString()}`,
      customerIdx,
      amount,
      currency: "USD",
      occurred_at: occurred.toISOString(),
      payment_method: pick(rng, PAYMENT_METHODS),
      status,
      failure_reason: failureReason,
      retry_count: 0,
      checkout_status: checkout,
      subscription_status: subscription ?? (rng() < 0.22 ? "active" : null),
      recovery_probability: 0,
      recovery_status: "none",
      hoursSince,
    });
  }
  return out;
}

interface HistoryStep {
  action: string;
  outcome: string;
  reason: string;
  diagnosis: string;
  probability: number;
  risk: string;
  confidence: number;
  recovered: number;
  stop_reason: string | null;
}

interface CaseSpec {
  txIdx: number;
  customerIdx: number;
  amount_at_risk: number;
  risk_level: string;
  recovery_probability: number;
  priority_score: number;
  status: string;
  retry_count: number;
  reminder_count: number;
  reengagement_count: number;
  alt_method_count: number;
  recommended_action: string | null;
  stop_reason: string | null;
  recovered_amount: number;
  recovered_at: string | null;
  steps: HistoryStep[];
}

/** Deterministically replays the bounded recovery workflow to build demo history. */
function simulateCaseHistory(tx: TxSpec, customer: CustomerSpec, rules: MerchantRules): CaseSpec {
  const features: CaseFeatures = {
    amount: tx.amount,
    failure_reason: tx.failure_reason,
    retry_count: 0,
    reminder_count: 0,
    reengagement_count: 0,
    alt_method_count: 0,
    previous_success_count: customer.previous_success_count,
    previous_failure_count: customer.previous_failure_count,
    hours_since_failure: tx.hoursSince,
    opted_out: customer.opted_out,
    status: "open",
  };

  const baseProbability = computeRecoveryProbability(features);
  const spec: CaseSpec = {
    txIdx: -1,
    customerIdx: tx.customerIdx,
    amount_at_risk: tx.amount,
    risk_level: riskLevelFor(baseProbability, tx.amount),
    recovery_probability: baseProbability,
    priority_score: priorityScore(tx.amount, baseProbability, tx.hoursSince, 0),
    status: "open",
    retry_count: 0,
    reminder_count: 0,
    reengagement_count: 0,
    alt_method_count: 0,
    recommended_action: null,
    stop_reason: null,
    recovered_amount: 0,
    recovered_at: null,
    steps: [],
  };

  // Only part of the dataset has already been worked, so the queue keeps fresh cases.
  const worked = seededUnit(`${tx.transaction_ref}:worked`) < 0.55;
  if (!worked) {
    const decision = fallbackDecision(features, rules);
    spec.recommended_action = decision.recommended_action;
    spec.stop_reason = decision.stop_reason;
    return spec;
  }

  for (let step = 0; step < 4; step++) {
    const decision = fallbackDecision(features, rules);
    spec.recommended_action = decision.recommended_action;
    spec.stop_reason = decision.stop_reason;
    spec.recovery_probability = decision.recovery_probability;
    spec.risk_level = decision.risk_level;

    if (decision.recommended_action === "NO_ACTION") {
      spec.status = features.status === "open" ? "stopped" : spec.status;
      break;
    }

    const outcome = simulateOutcome(
      `${tx.transaction_ref}:${step}:${decision.recommended_action}`,
      decision.recommended_action,
      decision.recovery_probability,
    );

    spec.steps.push({
      action: decision.recommended_action,
      outcome,
      reason: decision.reason,
      diagnosis: decision.diagnosis,
      probability: decision.recovery_probability,
      risk: decision.risk_level,
      confidence: decision.confidence,
      recovered: outcome === "SUCCESS" ? tx.amount : 0,
      stop_reason: decision.stop_reason,
    });

    const counter = counterFieldFor(decision.recommended_action);
    if (counter === "retry_count") features.retry_count += 1;
    if (counter === "reminder_count") features.reminder_count += 1;
    if (counter === "reengagement_count") features.reengagement_count += 1;
    if (counter === "alt_method_count") features.alt_method_count += 1;

    if (outcome === "SUCCESS") {
      spec.status = "recovered";
      spec.recovered_amount = tx.amount;
      spec.recovered_at = new Date(
        Date.parse(tx.occurred_at) + (step + 1) * 5 * 3_600_000,
      ).toISOString();
      spec.stop_reason = "PAYMENT_SUCCEEDED";
      break;
    }
    if (outcome === "ESCALATED") {
      spec.status = "escalated";
      features.status = "escalated";
      spec.stop_reason = spec.stop_reason ?? "CASE_ESCALATED";
      break;
    }
    spec.status = "in_progress";
  }

  spec.retry_count = features.retry_count;
  spec.reminder_count = features.reminder_count;
  spec.reengagement_count = features.reengagement_count;
  spec.alt_method_count = features.alt_method_count;
  if (spec.status === "in_progress") {
    const stop = fallbackDecision(features, rules);
    if (stop.stop_reason) {
      spec.status = "stopped";
      spec.stop_reason = stop.stop_reason;
    }
  }
  spec.priority_score = priorityScore(
    tx.amount,
    spec.recovery_probability,
    tx.hoursSince,
    spec.retry_count + spec.reminder_count + spec.reengagement_count + spec.alt_method_count,
  );
  return spec;
}

async function chunkedInsert<T extends Record<string, unknown>>(
  db: Db,
  table: "customers" | "transactions" | "recovery_cases" | "ai_decisions" | "recovery_attempts",
  rows: T[],
  size = 200,
): Promise<Array<{ id: string }>> {
  const ids: Array<{ id: string }> = [];
  for (let i = 0; i < rows.length; i += size) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db.from(table) as any)
      .insert(rows.slice(i, i + size))
      .select("id");
    if (error) throw new Error(`Failed to write ${table}: ${error.message}`);
    ids.push(...((data ?? []) as Array<{ id: string }>));
  }
  return ids;
}

export interface GenerateResult {
  customers: number;
  transactions: number;
  cases: number;
  decisions: number;
  attempts: number;
}

/** Wipes and regenerates the reproducible synthetic dataset for this merchant. */
export async function regenerateDemoData(
  db: Db,
  userId: string,
  rules: MerchantRules,
): Promise<GenerateResult> {
  // Cascading deletes clear cases, decisions and attempts.
  await db.from("recovery_attempts").delete().eq("user_id", userId);
  await db.from("ai_decisions").delete().eq("user_id", userId);
  await db.from("recovery_cases").delete().eq("user_id", userId);
  await db.from("transactions").delete().eq("user_id", userId);
  await db.from("customers").delete().eq("user_id", userId);
  await db.from("audit_events").delete().eq("user_id", userId);

  const rng = makeRng(SEED);
  const now = Date.now();
  const customers = buildCustomers(rng);
  const transactions = buildTransactions(rng, customers, now);

  const customerIds = await chunkedInsert(
    db,
    "customers",
    customers.map((c) => ({
      user_id: userId,
      external_id: c.external_id,
      name: c.name,
      email: c.email,
      lifetime_value: c.lifetime_value,
      previous_success_count: c.previous_success_count,
      previous_failure_count: c.previous_failure_count,
      risk_level: c.risk_level,
      opted_out: c.opted_out,
    })),
  );

  const caseSpecs: CaseSpec[] = [];
  transactions.forEach((tx, idx) => {
    if (tx.status !== "FAILED" && tx.status !== "ABANDONED") return;
    const spec = simulateCaseHistory(tx, customers[tx.customerIdx]!, rules);
    spec.txIdx = idx;
    caseSpecs.push(spec);
    tx.retry_count = spec.retry_count;
    tx.recovery_probability = spec.recovery_probability;
    tx.recovery_status =
      spec.status === "recovered"
        ? "recovered"
        : spec.status === "escalated"
          ? "escalated"
          : spec.status === "stopped"
            ? "stopped"
            : spec.steps.length > 0
              ? "in_progress"
              : "eligible";
    if (spec.status === "recovered") tx.status = "RECOVERED";
  });

  const txIds = await chunkedInsert(
    db,
    "transactions",
    transactions.map((tx) => ({
      user_id: userId,
      transaction_ref: tx.transaction_ref,
      customer_id: customerIds[tx.customerIdx]!.id,
      amount: tx.amount,
      currency: tx.currency,
      occurred_at: tx.occurred_at,
      payment_method: tx.payment_method,
      status: tx.status,
      failure_reason: tx.failure_reason,
      retry_count: tx.retry_count,
      checkout_status: tx.checkout_status,
      subscription_status: tx.subscription_status,
      recovery_probability: tx.recovery_probability,
      recovery_status: tx.recovery_status,
    })),
  );

  const caseIds = await chunkedInsert(
    db,
    "recovery_cases",
    caseSpecs.map((spec) => ({
      user_id: userId,
      transaction_id: txIds[spec.txIdx]!.id,
      customer_id: customerIds[spec.customerIdx]!.id,
      amount_at_risk: spec.amount_at_risk,
      risk_level: spec.risk_level,
      recovery_probability: spec.recovery_probability,
      priority_score: spec.priority_score,
      status: spec.status,
      retry_count: spec.retry_count,
      reminder_count: spec.reminder_count,
      reengagement_count: spec.reengagement_count,
      alt_method_count: spec.alt_method_count,
      recommended_action: spec.recommended_action,
      stop_reason: spec.stop_reason,
      recovered_amount: spec.recovered_amount,
      recovered_at: spec.recovered_at,
    })),
  );

  const decisionRows: Array<Record<string, unknown>> = [];
  const decisionOwners: Array<{ caseIdx: number; stepIdx: number }> = [];
  caseSpecs.forEach((spec, caseIdx) => {
    spec.steps.forEach((step, stepIdx) => {
      const tx = transactions[spec.txIdx]!;
      decisionRows.push({
        user_id: userId,
        case_id: caseIds[caseIdx]!.id,
        diagnosis: step.diagnosis,
        recovery_probability: step.probability,
        risk_level: step.risk,
        recommended_action: step.action,
        reason: step.reason,
        next_attempt_at: null,
        stop_reason: step.stop_reason,
        confidence: Math.round(step.confidence),
        source: "rule_based_fallback",
        created_at: new Date(Date.parse(tx.occurred_at) + (stepIdx + 1) * 3_600_000).toISOString(),
      });
      decisionOwners.push({ caseIdx, stepIdx });
    });
  });

  const decisionIds = await chunkedInsert(db, "ai_decisions", decisionRows);

  const attemptRows = decisionOwners.map((owner, i) => {
    const spec = caseSpecs[owner.caseIdx]!;
    const step = spec.steps[owner.stepIdx]!;
    const tx = transactions[spec.txIdx]!;
    return {
      user_id: userId,
      case_id: caseIds[owner.caseIdx]!.id,
      decision_id: decisionIds[i]?.id ?? null,
      action: step.action,
      outcome: step.outcome,
      amount: spec.amount_at_risk,
      recovered_amount: step.recovered,
      reason: step.reason,
      created_at: new Date(
        Date.parse(tx.occurred_at) + (owner.stepIdx + 1) * 3_600_000 + 600_000,
      ).toISOString(),
    };
  });
  await chunkedInsert(db, "recovery_attempts", attemptRows);

  await writeAudit(db, userId, [
    {
      event_type: "DATA_RESET",
      actor: "demo_controls",
      action: "GENERATE_SYNTHETIC_DATASET",
      reason: `Seeded dataset (seed ${SEED})`,
      result: `${customers.length} customers, ${transactions.length} transactions, ${caseSpecs.length} recovery cases`,
    },
    ...caseSpecs.slice(0, 120).map((spec) => ({
      event_type: "CASE_CREATED",
      transaction_ref: transactions[spec.txIdx]!.transaction_ref,
      case_id: caseIds[caseSpecs.indexOf(spec)]!.id,
      actor: "detection_engine",
      action: "OPEN_RECOVERY_CASE",
      reason: `Detected ${transactions[spec.txIdx]!.failure_reason}`,
      result: `${spec.recovery_probability}% recovery probability`,
    })),
  ]);

  return {
    customers: customers.length,
    transactions: transactions.length,
    cases: caseSpecs.length,
    decisions: decisionRows.length,
    attempts: attemptRows.length,
  };
}

export const DEMO_SEED = SEED;
export const FAILURE_REASON_LIST = FAILURE_REASONS;
