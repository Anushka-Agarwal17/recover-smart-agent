import {
  ACTION_LABELS,
  ACTION_LIMITS,
  RECOVERY_ACTIONS,
  buildDiagnosis,
  computeRecoveryProbability,
  counterFieldFor,
  evaluateStoppingRules,
  fallbackDecision,
  priorityScore,
  riskLevelFor,
  simulateOutcome,
  type CaseFeatures,
  type EngineDecision,
  type MerchantRules,
  type RecoveryAction,
} from "./recovery-engine";
import { requestAiDecision } from "./ai.server";
import { fail, writeAudit, type Db } from "./db.server";

interface CaseRecord {
  id: string;
  status: string;
  retry_count: number;
  reminder_count: number;
  reengagement_count: number;
  alt_method_count: number;
  amount_at_risk: number;
  recommended_action: string | null;
  transaction: {
    id: string;
    transaction_ref: string;
    amount: number;
    currency: string;
    payment_method: string;
    failure_reason: string | null;
    occurred_at: string;
  };
  customer: {
    id: string;
    previous_success_count: number;
    previous_failure_count: number;
    opted_out: boolean;
  };
}

const CASE_SELECT =
  "id, status, retry_count, reminder_count, reengagement_count, alt_method_count, amount_at_risk, recommended_action, transactions!inner(id, transaction_ref, amount, currency, payment_method, failure_reason, occurred_at), customers!inner(id, previous_success_count, previous_failure_count, opted_out)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCase(row: any): CaseRecord {
  return {
    id: row.id,
    status: row.status,
    retry_count: row.retry_count,
    reminder_count: row.reminder_count,
    reengagement_count: row.reengagement_count,
    alt_method_count: row.alt_method_count,
    amount_at_risk: Number(row.amount_at_risk),
    recommended_action: row.recommended_action,
    transaction: { ...row.transactions, amount: Number(row.transactions.amount) },
    customer: row.customers,
  };
}

function featuresOf(record: CaseRecord): CaseFeatures {
  return {
    amount: record.amount_at_risk,
    failure_reason: record.transaction.failure_reason,
    retry_count: record.retry_count,
    reminder_count: record.reminder_count,
    reengagement_count: record.reengagement_count,
    alt_method_count: record.alt_method_count,
    previous_success_count: record.customer.previous_success_count,
    previous_failure_count: record.customer.previous_failure_count,
    hours_since_failure: (Date.now() - Date.parse(record.transaction.occurred_at)) / 3_600_000,
    opted_out: record.customer.opted_out,
    status: record.status as CaseFeatures["status"],
  };
}

function allowedActions(features: CaseFeatures, rules: MerchantRules): RecoveryAction[] {
  const allowed: RecoveryAction[] = ["NO_ACTION", "ESCALATE"];
  if (features.retry_count < Math.min(rules.max_retries, ACTION_LIMITS.SMART_RETRY.max))
    allowed.push("SMART_RETRY");
  if (features.reminder_count < ACTION_LIMITS.PAYMENT_REMINDER.max) allowed.push("PAYMENT_REMINDER");
  if (features.alt_method_count < ACTION_LIMITS.ALTERNATE_PAYMENT_METHOD.max)
    allowed.push("ALTERNATE_PAYMENT_METHOD");
  if (
    features.failure_reason === "checkout_abandoned" &&
    features.reengagement_count < ACTION_LIMITS.CHECKOUT_REENGAGEMENT.max
  )
    allowed.push("CHECKOUT_REENGAGEMENT");
  return allowed;
}

async function decide(record: CaseRecord, rules: MerchantRules, useAi: boolean): Promise<EngineDecision> {
  const features = featuresOf(record);
  const computed = computeRecoveryProbability(features);
  const stop = evaluateStoppingRules(features, computed, rules);
  const fallback = fallbackDecision(features, rules);
  if (!useAi || stop) return fallback;

  const permitted = allowedActions(features, rules);
  const ai = await requestAiDecision({
    transaction_ref: record.transaction.transaction_ref,
    amount: record.amount_at_risk,
    currency: record.transaction.currency,
    payment_method: record.transaction.payment_method,
    failure_reason: record.transaction.failure_reason,
    hours_since_failure: Math.round(features.hours_since_failure),
    features,
    computed_probability: computed,
    rules,
    allowed_actions: permitted,
    guardrail_stop_reason: stop,
  });

  if (!ai) return fallback;

  // Clamp the model's probability to the deterministic estimate and re-run guardrails.
  const probability = Math.max(computed - 12, Math.min(computed + 12, ai.recovery_probability));
  const postStop = evaluateStoppingRules(features, probability, rules);
  if (postStop) return { ...fallback, stop_reason: postStop };

  const delay =
    ai.recommended_action === "SMART_RETRY"
      ? ACTION_LIMITS.SMART_RETRY.minDelayMinutes
      : ai.recommended_action === "PAYMENT_REMINDER"
        ? ACTION_LIMITS.PAYMENT_REMINDER.minDelayMinutes
        : ai.recommended_action === "CHECKOUT_REENGAGEMENT"
          ? ACTION_LIMITS.CHECKOUT_REENGAGEMENT.minDelayMinutes
          : ai.recommended_action === "ALTERNATE_PAYMENT_METHOD"
            ? ACTION_LIMITS.ALTERNATE_PAYMENT_METHOD.minDelayMinutes
            : 0;

  return {
    diagnosis: ai.diagnosis || buildDiagnosis(features, probability),
    recovery_probability: probability,
    risk_level: ai.risk_level ?? riskLevelFor(probability, record.amount_at_risk),
    recommended_action: ai.recommended_action,
    reason: ai.reason,
    next_attempt_at: delay ? new Date(Date.now() + delay * 60_000).toISOString() : null,
    stop_reason: null,
    confidence: ai.confidence,
    source: "ai",
  };
}

async function persistDecision(
  db: Db,
  userId: string,
  record: CaseRecord,
  decision: EngineDecision,
): Promise<string> {
  const { data, error } = await db
    .from("ai_decisions")
    .insert({
      user_id: userId,
      case_id: record.id,
      diagnosis: decision.diagnosis,
      recovery_probability: decision.recovery_probability,
      risk_level: decision.risk_level,
      recommended_action: decision.recommended_action,
      reason: decision.reason,
      next_attempt_at: decision.next_attempt_at,
      stop_reason: decision.stop_reason,
      confidence: Math.round(decision.confidence),
      source: decision.source,
    })
    .select("id")
    .single();
  if (error || !data) fail("The decision could not be saved. Existing case state is unchanged.");

  const features = featuresOf(record);
  await db
    .from("recovery_cases")
    .update({
      recovery_probability: decision.recovery_probability,
      risk_level: decision.risk_level,
      recommended_action: decision.recommended_action,
      stop_reason: decision.stop_reason,
      priority_score: priorityScore(
        record.amount_at_risk,
        decision.recovery_probability,
        features.hours_since_failure,
        record.retry_count + record.reminder_count + record.reengagement_count + record.alt_method_count,
      ),
      status:
        decision.stop_reason && record.status !== "recovered"
          ? decision.stop_reason === "CASE_ESCALATED"
            ? "escalated"
            : "stopped"
          : record.status,
    })
    .eq("id", record.id)
    .eq("user_id", userId);

  await writeAudit(db, userId, [
    {
      event_type: "AI_ANALYSIS_COMPLETED",
      transaction_ref: record.transaction.transaction_ref,
      customer_id: record.customer.id,
      case_id: record.id,
      actor: decision.source === "ai" ? "ai_agent" : "rule_based_fallback",
      action: "ANALYZE_CASE",
      reason: decision.reason,
      result: `${decision.recommended_action} @ ${decision.recovery_probability}%`,
    },
    {
      event_type: "RECOVERY_ACTION_SELECTED",
      transaction_ref: record.transaction.transaction_ref,
      case_id: record.id,
      actor: decision.source === "ai" ? "ai_agent" : "rule_based_fallback",
      action: decision.recommended_action,
      reason: decision.reason,
      result: decision.stop_reason ? `blocked: ${decision.stop_reason}` : "selected",
    },
    ...(decision.stop_reason
      ? [
          {
            event_type: "STOPPING_RULE_TRIGGERED",
            transaction_ref: record.transaction.transaction_ref,
            case_id: record.id,
            actor: "guardrails",
            action: "HALT_AUTOMATION",
            reason: decision.stop_reason,
            result: "no further automated attempts",
          },
        ]
      : []),
  ]);

  return data.id;
}

async function fetchCase(db: Db, userId: string, caseId: string): Promise<CaseRecord> {
  const { data, error } = await db
    .from("recovery_cases")
    .select(CASE_SELECT)
    .eq("user_id", userId)
    .eq("id", caseId)
    .maybeSingle();
  if (error) fail("Could not read this recovery case.");
  if (!data) fail("Recovery case not found.");
  return normalizeCase(data);
}

export async function analyzeCase(
  db: Db,
  userId: string,
  caseId: string,
  rules: MerchantRules,
): Promise<{ decisionId: string; decision: EngineDecision }> {
  const record = await fetchCase(db, userId, caseId);
  if (record.status === "recovered") fail("This transaction is already recovered.");
  const decision = await decide(record, rules, true);
  const decisionId = await persistDecision(db, userId, record, decision);
  return { decisionId, decision };
}

export async function runRecoveryBatch(
  db: Db,
  userId: string,
  rules: MerchantRules,
  limit = 12,
): Promise<{ analyzed: number; blocked: number; actions: Record<string, number> }> {
  const { data, error } = await db
    .from("recovery_cases")
    .select(CASE_SELECT)
    .eq("user_id", userId)
    .in("status", ["open", "in_progress"])
    .order("priority_score", { ascending: false })
    .limit(Math.min(25, Math.max(1, limit)));
  if (error) fail("Could not load the recovery queue.");
  const records = (data ?? []).map(normalizeCase);
  if (records.length === 0) return { analyzed: 0, blocked: 0, actions: {} };

  const actions: Record<string, number> = {};
  let blocked = 0;
  for (const record of records) {
    const decision = await decide(record, rules, true);
    await persistDecision(db, userId, record, decision);
    actions[decision.recommended_action] = (actions[decision.recommended_action] ?? 0) + 1;
    if (decision.stop_reason) blocked += 1;
  }
  return { analyzed: records.length, blocked, actions };
}

export interface ExecutionResult {
  outcome: string;
  action: string;
  label: string;
  recovered_amount: number;
  status: string;
  stop_reason: string | null;
  message: string;
}

/** Executes one bounded recovery action, applies stopping rules and records the outcome. */
export async function executeRecoveryAction(
  db: Db,
  userId: string,
  caseId: string,
  rules: MerchantRules,
): Promise<ExecutionResult> {
  const record = await fetchCase(db, userId, caseId);
  if (record.status === "recovered") fail("This transaction is already recovered; no further action is allowed.");
  if (record.status === "escalated") fail("This case is escalated and is no longer handled automatically.");

  const features = featuresOf(record);
  const probability = computeRecoveryProbability(features);
  const stop = evaluateStoppingRules(features, probability, rules);

  const { data: latestDecision } = await db
    .from("ai_decisions")
    .select("id, recommended_action, recovery_probability, reason")
    .eq("user_id", userId)
    .eq("case_id", record.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestDecision) fail("Run the recovery analysis for this case before executing an action.");

  const action = latestDecision.recommended_action as RecoveryAction;
  if (!RECOVERY_ACTIONS.includes(action)) fail("The selected action is not a permitted recovery action.");

  if (stop || action === "NO_ACTION" || action === "ESCALATE") {
    const reason = stop ?? (action === "ESCALATE" ? "CASE_ESCALATED" : "NO_ELIGIBLE_ACTION");
    await db
      .from("recovery_cases")
      .update({ status: action === "ESCALATE" ? "escalated" : "stopped", stop_reason: reason })
      .eq("id", record.id)
      .eq("user_id", userId);
    await db.from("recovery_attempts").insert({
      user_id: userId,
      case_id: record.id,
      decision_id: latestDecision.id,
      action,
      outcome: action === "ESCALATE" ? "ESCALATED" : "NO_RESPONSE",
      amount: record.amount_at_risk,
      recovered_amount: 0,
      reason,
    });
    await writeAudit(db, userId, [
      {
        event_type: action === "ESCALATE" ? "ESCALATED" : "STOPPING_RULE_TRIGGERED",
        transaction_ref: record.transaction.transaction_ref,
        case_id: record.id,
        actor: "recovery_engine",
        action,
        reason,
        result: "automation halted",
      },
    ]);
    return {
      outcome: action === "ESCALATE" ? "ESCALATED" : "NO_RESPONSE",
      action,
      label: ACTION_LABELS[action],
      recovered_amount: 0,
      status: action === "ESCALATE" ? "escalated" : "stopped",
      stop_reason: reason,
      message:
        action === "ESCALATE"
          ? "Case escalated for manual review. Automated recovery has stopped."
          : `Automated recovery stopped: ${reason.toLowerCase().replace(/_/g, " ")}.`,
    };
  }

  const attemptIndex =
    record.retry_count + record.reminder_count + record.reengagement_count + record.alt_method_count;
  const outcome = simulateOutcome(
    `${record.transaction.transaction_ref}:${attemptIndex}:${action}`,
    action,
    probability,
  );

  await writeAudit(db, userId, [
    {
      event_type: "RECOVERY_ATTEMPT_STARTED",
      transaction_ref: record.transaction.transaction_ref,
      case_id: record.id,
      actor: "recovery_engine",
      action,
      reason: latestDecision.reason,
      result: "simulated execution",
    },
  ]);

  const counter = counterFieldFor(action);
  const update: {
    status: string;
    retry_count?: number;
    reminder_count?: number;
    reengagement_count?: number;
    alt_method_count?: number;
    recovered_amount?: number;
    recovered_at?: string;
    stop_reason?: string;
    recovery_probability?: number;
  } = { status: "in_progress" };
  if (counter === "retry_count") update.retry_count = record.retry_count + 1;
  if (counter === "reminder_count") update.reminder_count = record.reminder_count + 1;
  if (counter === "reengagement_count") update.reengagement_count = record.reengagement_count + 1;
  if (counter === "alt_method_count") update.alt_method_count = record.alt_method_count + 1;

  let recoveredAmount = 0;
  let stopReason: string | null = null;

  if (outcome === "SUCCESS") {
    recoveredAmount = record.amount_at_risk;
    stopReason = "PAYMENT_SUCCEEDED";
    update.status = "recovered";
    update.recovered_amount = recoveredAmount;
    update.recovered_at = new Date().toISOString();
    update.stop_reason = stopReason;
  } else {
    const nextFeatures: CaseFeatures = {
      ...features,
      retry_count: update.retry_count ?? features.retry_count,
      reminder_count: update.reminder_count ?? features.reminder_count,
      reengagement_count: update.reengagement_count ?? features.reengagement_count,
      alt_method_count: update.alt_method_count ?? features.alt_method_count,
    };
    const nextProbability = computeRecoveryProbability(nextFeatures);
    stopReason = evaluateStoppingRules(nextFeatures, nextProbability, rules);
    update.recovery_probability = nextProbability;
    if (stopReason) {
      update.status = stopReason === "CASE_ESCALATED" ? "escalated" : "stopped";
      update.stop_reason = stopReason;
    }
  }

  const { error: updateError } = await db
    .from("recovery_cases")
    .update(update)
    .eq("id", record.id)
    .eq("user_id", userId);
  if (updateError) fail("The recovery outcome could not be saved.");

  await db.from("recovery_attempts").insert({
    user_id: userId,
    case_id: record.id,
    decision_id: latestDecision.id,
    action,
    outcome,
    amount: record.amount_at_risk,
    recovered_amount: recoveredAmount,
    reason: latestDecision.reason,
  });

  await db
    .from("transactions")
    .update({
      status: outcome === "SUCCESS" ? "RECOVERED" : record.transaction.failure_reason === "checkout_abandoned" ? "ABANDONED" : "FAILED",
      retry_count: update.retry_count ?? record.retry_count,
      recovery_status:
        outcome === "SUCCESS"
          ? "recovered"
          : stopReason
            ? stopReason === "CASE_ESCALATED"
              ? "escalated"
              : "stopped"
            : "in_progress",
    })
    .eq("id", record.transaction.id)
    .eq("user_id", userId);

  await writeAudit(db, userId, [
    {
      event_type: outcome === "SUCCESS" ? "RECOVERY_SUCCEEDED" : "RECOVERY_FAILED",
      transaction_ref: record.transaction.transaction_ref,
      customer_id: record.customer.id,
      case_id: record.id,
      actor: "recovery_engine",
      action,
      reason: latestDecision.reason,
      result:
        outcome === "SUCCESS"
          ? `simulated recovery of ${record.amount_at_risk.toFixed(2)} ${record.transaction.currency}`
          : outcome,
    },
    ...(stopReason && outcome !== "SUCCESS"
      ? [
          {
            event_type: "STOPPING_RULE_TRIGGERED",
            transaction_ref: record.transaction.transaction_ref,
            case_id: record.id,
            actor: "guardrails",
            action: "HALT_AUTOMATION",
            reason: stopReason,
            result: "no further automated attempts",
          },
        ]
      : []),
  ]);

  const message =
    outcome === "SUCCESS"
      ? `${ACTION_LABELS[action]} succeeded — simulated recovery recorded and further interventions stopped.`
      : outcome === "NO_RESPONSE"
        ? `${ACTION_LABELS[action]} produced no response.${stopReason ? " Automation stopped by guardrail." : " The case remains eligible."}`
        : `${ACTION_LABELS[action]} failed.${stopReason ? " Automation stopped by guardrail." : " The next allowed action can be scheduled."}`;

  return {
    outcome,
    action,
    label: ACTION_LABELS[action],
    recovered_amount: recoveredAmount,
    status: update.status ?? "in_progress",
    stop_reason: stopReason,
    message,
  };
}
