import { ACTION_LABELS, maskEmail, type RecoveryAction } from "./recovery-engine";
import { fail, type Db } from "./db.server";

export interface Kpi {
  label: string;
  value: number;
  format: "currency" | "percent" | "count";
  hint: string;
  delta: number | null;
}

export interface OverviewData {
  kpis: Kpi[];
  funnel: Array<{ stage: string; count: number; amount: number }>;
  riskTrend: Array<{ date: string; atRisk: number; recovered: number }>;
  failureReasons: Array<{ reason: string; count: number; amount: number }>;
  actionPerformance: Array<{
    action: string;
    label: string;
    attempts: number;
    successes: number;
    recovered: number;
    rate: number;
  }>;
  recentDecisions: Array<{
    id: string;
    case_id: string;
    created_at: string;
    transaction_ref: string;
    customer: string;
    amount: number;
    risk_level: string;
    recommended_action: string;
    confidence: number;
    status: string;
    source: string;
  }>;
  dataset: { transactions: number; cases: number; customers: number };
}

const DAY = 86_400_000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function loadOverview(db: Db, userId: string): Promise<OverviewData> {
  const [txRes, caseRes, attemptRes, decisionRes, customerCountRes] = await Promise.all([
    db
      .from("transactions")
      .select("amount, status, failure_reason, occurred_at, recovery_status, recovery_probability")
      .eq("user_id", userId),
    db
      .from("recovery_cases")
      .select(
        "id, amount_at_risk, status, recovery_probability, recovered_amount, recovered_at, created_at, retry_count, reminder_count, reengagement_count, alt_method_count",
      )
      .eq("user_id", userId),
    db.from("recovery_attempts").select("action, outcome, recovered_amount, created_at").eq("user_id", userId),
    db
      .from("ai_decisions")
      .select(
        "id, created_at, risk_level, recommended_action, confidence, source, case_id, recovery_probability",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    db.from("customers").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  if (txRes.error) fail("Could not load transactions.");
  const transactions = txRes.data ?? [];
  const cases = caseRes.data ?? [];
  const attempts = attemptRes.data ?? [];

  const atRiskCases = cases.filter((c) => c.status !== "recovered");
  const totalAtRisk = atRiskCases.reduce((sum, c) => sum + Number(c.amount_at_risk), 0);
  const eligibleRevenue = cases.reduce((sum, c) => sum + Number(c.amount_at_risk), 0);
  const recoverable = cases
    .filter((c) => c.status !== "recovered" && c.recovery_probability >= 40)
    .reduce((sum, c) => sum + Number(c.amount_at_risk), 0);
  const recovered = cases.reduce((sum, c) => sum + Number(c.recovered_amount), 0);
  const recoveryRate = eligibleRevenue > 0 ? (recovered / eligibleRevenue) * 100 : 0;
  const failedPayments = transactions.filter((t) => t.status === "FAILED" || t.status === "ABANDONED").length;
  const activeCases = cases.filter((c) => c.status === "open" || c.status === "in_progress").length;

  // Period comparison: last 14 days vs the 14 before it, from real records only.
  const now = Date.now();
  const inWindow = (iso: string | null, from: number, to: number) =>
    iso != null && Date.parse(iso) >= from && Date.parse(iso) < to;
  const recoveredCurrent = cases
    .filter((c) => inWindow(c.recovered_at, now - 14 * DAY, now))
    .reduce((s, c) => s + Number(c.recovered_amount), 0);
  const recoveredPrev = cases
    .filter((c) => inWindow(c.recovered_at, now - 28 * DAY, now - 14 * DAY))
    .reduce((s, c) => s + Number(c.recovered_amount), 0);
  const riskCurrent = transactions
    .filter((t) => (t.status === "FAILED" || t.status === "ABANDONED") && inWindow(t.occurred_at, now - 14 * DAY, now))
    .reduce((s, t) => s + Number(t.amount), 0);
  const riskPrev = transactions
    .filter(
      (t) =>
        (t.status === "FAILED" || t.status === "ABANDONED") &&
        inWindow(t.occurred_at, now - 28 * DAY, now - 14 * DAY),
    )
    .reduce((s, t) => s + Number(t.amount), 0);
  const pct = (current: number, prev: number) => (prev > 0 ? ((current - prev) / prev) * 100 : null);

  const kpis: Kpi[] = [
    {
      label: "Total Revenue at Risk",
      value: totalAtRisk,
      format: "currency",
      hint: "Open, in-progress, stopped and escalated case value",
      delta: pct(riskCurrent, riskPrev),
    },
    {
      label: "Recoverable Revenue",
      value: recoverable,
      format: "currency",
      hint: "At-risk value with ≥40% modelled recovery probability",
      delta: null,
    },
    {
      label: "Revenue Recovered",
      value: recovered,
      format: "currency",
      hint: "Simulated recoveries confirmed by the engine",
      delta: pct(recoveredCurrent, recoveredPrev),
    },
    {
      label: "Recovery Rate",
      value: recoveryRate,
      format: "percent",
      hint: "Recovered revenue ÷ eligible revenue",
      delta: null,
    },
    {
      label: "Failed & Abandoned Payments",
      value: failedPayments,
      format: "count",
      hint: "Transactions that entered the recovery funnel",
      delta: null,
    },
    {
      label: "Active Recovery Cases",
      value: activeCases,
      format: "count",
      hint: "Cases still eligible for bounded intervention",
      delta: null,
    },
  ];

  const interventionSent = cases.filter(
    (c) => c.retry_count + c.reminder_count + c.reengagement_count + c.alt_method_count > 0,
  );
  const retried = cases.filter((c) => c.retry_count > 0);
  const eligible = cases.filter((c) => c.recovery_probability >= 40);
  const recoveredCases = cases.filter((c) => c.status === "recovered");
  const sumAmount = (rows: typeof cases) => rows.reduce((s, c) => s + Number(c.amount_at_risk), 0);

  const funnel = [
    { stage: "At Risk", count: cases.length, amount: sumAmount(cases) },
    { stage: "Eligible for Recovery", count: eligible.length, amount: sumAmount(eligible) },
    { stage: "Intervention Sent", count: interventionSent.length, amount: sumAmount(interventionSent) },
    { stage: "Retry Attempted", count: retried.length, amount: sumAmount(retried) },
    { stage: "Recovered", count: recoveredCases.length, amount: sumAmount(recoveredCases) },
  ];

  const trendMap = new Map<string, { atRisk: number; recovered: number }>();
  for (let i = 29; i >= 0; i--) {
    trendMap.set(new Date(now - i * DAY).toISOString().slice(0, 10), { atRisk: 0, recovered: 0 });
  }
  for (const t of transactions) {
    if (t.status !== "FAILED" && t.status !== "ABANDONED" && t.status !== "RECOVERED") continue;
    const bucket = trendMap.get(dayKey(t.occurred_at));
    if (bucket) bucket.atRisk += Number(t.amount);
  }
  for (const c of cases) {
    if (!c.recovered_at) continue;
    const bucket = trendMap.get(dayKey(c.recovered_at));
    if (bucket) bucket.recovered += Number(c.recovered_amount);
  }
  const riskTrend = [...trendMap.entries()].map(([date, v]) => ({
    date,
    atRisk: Math.round(v.atRisk),
    recovered: Math.round(v.recovered),
  }));

  const reasonMap = new Map<string, { count: number; amount: number }>();
  for (const t of transactions) {
    if (!t.failure_reason) continue;
    const entry = reasonMap.get(t.failure_reason) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += Number(t.amount);
    reasonMap.set(t.failure_reason, entry);
  }
  const failureReasons = [...reasonMap.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, amount: Math.round(v.amount) }))
    .sort((a, b) => b.count - a.count);

  const actionMap = new Map<string, { attempts: number; successes: number; recovered: number }>();
  for (const a of attempts) {
    const entry = actionMap.get(a.action) ?? { attempts: 0, successes: 0, recovered: 0 };
    entry.attempts += 1;
    if (a.outcome === "SUCCESS") entry.successes += 1;
    entry.recovered += Number(a.recovered_amount);
    actionMap.set(a.action, entry);
  }
  const actionPerformance = [...actionMap.entries()]
    .map(([action, v]) => ({
      action,
      label: ACTION_LABELS[action as RecoveryAction] ?? action,
      attempts: v.attempts,
      successes: v.successes,
      recovered: Math.round(v.recovered),
      rate: v.attempts > 0 ? Math.round((v.successes / v.attempts) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const decisions = decisionRes.data ?? [];
  let recentDecisions: OverviewData["recentDecisions"] = [];
  if (decisions.length > 0) {
    const { data: caseRows } = await db
      .from("recovery_cases")
      .select("id, amount_at_risk, status, transactions(transaction_ref), customers(name)")
      .in(
        "id",
        decisions.map((d) => d.case_id),
      );
    const caseById = new Map((caseRows ?? []).map((c) => [c.id, c]));
    recentDecisions = decisions.map((d) => {
      const linked = caseById.get(d.case_id);
      return {
        id: d.id,
        case_id: d.case_id,
        created_at: d.created_at,
        transaction_ref:
          (linked?.transactions as { transaction_ref: string } | null)?.transaction_ref ?? "—",
        customer: (linked?.customers as { name: string } | null)?.name ?? "—",
        amount: Number(linked?.amount_at_risk ?? 0),
        risk_level: d.risk_level,
        recommended_action: d.recommended_action,
        confidence: d.confidence,
        status: linked?.status ?? "open",
        source: d.source,
      };
    });
  }

  return {
    kpis,
    funnel,
    riskTrend,
    failureReasons,
    actionPerformance,
    recentDecisions,
    dataset: {
      transactions: transactions.length,
      cases: cases.length,
      customers: customerCountRes.count ?? 0,
    },
  };
}

export interface RiskCaseRow {
  id: string;
  transaction_ref: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  currency: string;
  failure_reason: string | null;
  occurred_at: string;
  previous_success_count: number;
  recovery_probability: number;
  amount_at_risk: number;
  recommended_action: string | null;
  status: string;
  stop_reason: string | null;
  risk_level: string;
  priority_score: number;
}


export interface RiskFilters {
  risk?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sort?: "priority" | "amount" | "probability" | "recent" | undefined;
}

export async function loadRiskCases(
  db: Db,
  userId: string,
  filters: RiskFilters,
): Promise<{ rows: RiskCaseRow[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));

  let query = db
    .from("recovery_cases")
    .select(
      "id, amount_at_risk, recovery_probability, recommended_action, status, risk_level, priority_score, transactions!inner(transaction_ref, amount, currency, failure_reason, occurred_at, status), customers!inner(name, email, previous_success_count)",
      { count: "exact" },
    )
    .eq("user_id", userId);

  if (filters.risk && filters.risk !== "all") query = query.eq("risk_level", filters.risk);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.minAmount != null) query = query.gte("amount_at_risk", filters.minAmount);
  if (filters.maxAmount != null) query = query.lte("amount_at_risk", filters.maxAmount);
  if (filters.kind === "checkout_abandoned")
    query = query.eq("transactions.failure_reason", "checkout_abandoned");
  if (filters.kind === "subscription_failed")
    query = query.eq("transactions.failure_reason", "subscription_failed");
  if (filters.kind === "payment_failed")
    query = query.not("transactions.failure_reason", "in", "(checkout_abandoned,subscription_failed)");

  const search = filters.search?.trim();
  if (search) {
    // Embedded-resource filters keep the search server-side instead of pulling every case.
    query = query.or(`transaction_ref.ilike.%${search}%`, { referencedTable: "transactions" });
  }

  const sort = filters.sort ?? "priority";
  if (sort === "amount") query = query.order("amount_at_risk", { ascending: false });
  else if (sort === "probability") query = query.order("recovery_probability", { ascending: false });
  else if (sort === "recent") query = query.order("created_at", { ascending: false });
  else query = query.order("priority_score", { ascending: false });

  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) fail("Could not load revenue-at-risk cases.");

  const rows = (data ?? []).map((row) => {
    const tx = row.transactions as unknown as {
      transaction_ref: string;
      amount: number;
      currency: string;
      failure_reason: string | null;
      occurred_at: string;
    };
    const customer = row.customers as unknown as {
      name: string;
      email: string;
      previous_success_count: number;
    };
    return {
      id: row.id,
      transaction_ref: tx.transaction_ref,
      customer_name: customer.name,
      customer_email: maskEmail(customer.email),
      amount: Number(tx.amount),
      currency: tx.currency,
      failure_reason: tx.failure_reason,
      occurred_at: tx.occurred_at,
      previous_success_count: customer.previous_success_count,
      recovery_probability: row.recovery_probability,
      amount_at_risk: Number(row.amount_at_risk),
      recommended_action: row.recommended_action,
      status: row.status,
      risk_level: row.risk_level,
      priority_score: Number(row.priority_score),
    };
  });

  const filtered = search
    ? rows.filter((r) =>
        [r.transaction_ref, r.customer_name, r.customer_email].some((v) =>
          v.toLowerCase().includes(search.toLowerCase()),
        ),
      )
    : rows;

  return { rows: filtered, total: count ?? filtered.length };
}

export interface CaseDetail {
  id: string;
  status: string;
  risk_level: string;
  recovery_probability: number;
  amount_at_risk: number;
  recovered_amount: number;
  recovered_at: string | null;
  stop_reason: string | null;
  recommended_action: string | null;
  counters: {
    retry_count: number;
    reminder_count: number;
    reengagement_count: number;
    alt_method_count: number;
  };
  transaction: {
    id: string;
    transaction_ref: string;
    amount: number;
    currency: string;
    occurred_at: string;
    payment_method: string;
    status: string;
    failure_reason: string | null;
    retry_count: number;
    checkout_status: string | null;
    subscription_status: string | null;
  };
  customer: {
    id: string;
    external_id: string;
    name: string;
    email: string;
    lifetime_value: number;
    previous_success_count: number;
    previous_failure_count: number;
    risk_level: string;
    opted_out: boolean;
  };
  decisions: Array<{
    id: string;
    created_at: string;
    diagnosis: string;
    reason: string;
    recommended_action: string;
    recovery_probability: number;
    risk_level: string;
    confidence: number;
    source: string;
    stop_reason: string | null;
    next_attempt_at: string | null;
  }>;
  attempts: Array<{
    id: string;
    created_at: string;
    action: string;
    outcome: string;
    recovered_amount: number;
    reason: string | null;
  }>;
}

export async function loadCaseDetail(db: Db, userId: string, caseId: string): Promise<CaseDetail> {
  const { data, error } = await db
    .from("recovery_cases")
    .select(
      "*, transactions!inner(*), customers!inner(*), ai_decisions(*), recovery_attempts(*)",
    )
    .eq("user_id", userId)
    .eq("id", caseId)
    .maybeSingle();

  if (error) fail("Could not load this recovery case.");
  if (!data) fail("Recovery case not found.");

  const tx = data.transactions as unknown as CaseDetail["transaction"];
  const customer = data.customers as unknown as CaseDetail["customer"] & { email: string };
  const decisions = (data.ai_decisions as unknown as CaseDetail["decisions"]).slice().sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const attempts = (data.recovery_attempts as unknown as CaseDetail["attempts"])
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return {
    id: data.id,
    status: data.status,
    risk_level: data.risk_level,
    recovery_probability: data.recovery_probability,
    amount_at_risk: Number(data.amount_at_risk),
    recovered_amount: Number(data.recovered_amount),
    recovered_at: data.recovered_at,
    stop_reason: data.stop_reason,
    recommended_action: data.recommended_action,
    counters: {
      retry_count: data.retry_count,
      reminder_count: data.reminder_count,
      reengagement_count: data.reengagement_count,
      alt_method_count: data.alt_method_count,
    },
    transaction: { ...tx, amount: Number(tx.amount) },
    customer: {
      ...customer,
      email: maskEmail(customer.email),
      lifetime_value: Number(customer.lifetime_value),
    },
    decisions: decisions.map((d) => ({ ...d })),
    attempts: attempts.map((a) => ({ ...a, recovered_amount: Number(a.recovered_amount) })),
  };
}

export interface TransactionRow {
  id: string;
  transaction_ref: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  currency: string;
  occurred_at: string;
  payment_method: string;
  status: string;
  failure_reason: string | null;
  retry_count: number;
  recovery_status: string;
  case_id: string | null;
}

export async function loadTransactions(
  db: Db,
  userId: string,
  params: {
    page?: number | undefined;
    pageSize?: number | undefined;
    status?: string | undefined;
    method?: string | undefined;
    search?: string | undefined;
    sort?: "recent" | "amount" | undefined;
  },
): Promise<{ rows: TransactionRow[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));

  let query = db
    .from("transactions")
    .select(
      "id, transaction_ref, amount, currency, occurred_at, payment_method, status, failure_reason, retry_count, recovery_status, customers!inner(name, email), recovery_cases(id)",
      { count: "exact" },
    )
    .eq("user_id", userId);

  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  if (params.method && params.method !== "all") query = query.eq("payment_method", params.method);
  const search = params.search?.trim();
  if (search) query = query.ilike("transaction_ref", `%${search}%`);

  query =
    params.sort === "amount"
      ? query.order("amount", { ascending: false })
      : query.order("occurred_at", { ascending: false });

  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) fail("Could not load transactions.");

  const rows = (data ?? []).map((row) => {
    const customer = row.customers as unknown as { name: string; email: string };
    const cases = (row.recovery_cases ?? []) as unknown as Array<{ id: string }>;
    return {
      id: row.id,
      transaction_ref: row.transaction_ref,
      customer_name: customer.name,
      customer_email: maskEmail(customer.email),
      amount: Number(row.amount),
      currency: row.currency,
      occurred_at: row.occurred_at,
      payment_method: row.payment_method,
      status: row.status,
      failure_reason: row.failure_reason,
      retry_count: row.retry_count,
      recovery_status: row.recovery_status,
      case_id: cases[0]?.id ?? null,
    };
  });

  return { rows, total: count ?? rows.length };
}

export interface CustomerRow {
  id: string;
  external_id: string;
  name: string;
  email: string;
  lifetime_value: number;
  previous_success_count: number;
  previous_failure_count: number;
  risk_level: string;
  total_transactions: number;
}

export async function loadCustomers(
  db: Db,
  userId: string,
  params: {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    risk?: string | undefined;
  },
): Promise<{ rows: CustomerRow[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));

  let query = db
    .from("customers")
    .select(
      "id, external_id, name, email, lifetime_value, previous_success_count, previous_failure_count, risk_level, transactions(count)",
      { count: "exact" },
    )
    .eq("user_id", userId);

  if (params.risk && params.risk !== "all") query = query.eq("risk_level", params.risk);
  const search = params.search?.trim();
  if (search) query = query.or(`name.ilike.%${search}%,external_id.ilike.%${search}%`);

  const { data, error, count } = await query
    .order("lifetime_value", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) fail("Could not load customers.");

  const rows = (data ?? []).map((row) => ({
    id: row.id,
    external_id: row.external_id,
    name: row.name,
    email: maskEmail(row.email),
    lifetime_value: Number(row.lifetime_value),
    previous_success_count: row.previous_success_count,
    previous_failure_count: row.previous_failure_count,
    risk_level: row.risk_level,
    total_transactions: (row.transactions as unknown as Array<{ count: number }>)[0]?.count ?? 0,
  }));

  return { rows, total: count ?? rows.length };
}

export interface CustomerDetail extends CustomerRow {
  opted_out: boolean;
  timeline: Array<{
    id: string;
    transaction_ref: string;
    amount: number;
    currency: string;
    occurred_at: string;
    status: string;
    failure_reason: string | null;
    payment_method: string;
    recovery_status: string;
    case_id: string | null;
  }>;
  recovered_amount: number;
}

export async function loadCustomerDetail(
  db: Db,
  userId: string,
  customerId: string,
): Promise<CustomerDetail> {
  const { data, error } = await db
    .from("customers")
    .select("*")
    .eq("user_id", userId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) fail("Could not load this customer.");
  if (!data) fail("Customer not found.");

  const [{ data: txs }, { data: cases }] = await Promise.all([
    db
      .from("transactions")
      .select(
        "id, transaction_ref, amount, currency, occurred_at, status, failure_reason, payment_method, recovery_status, recovery_cases(id)",
      )
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .order("occurred_at", { ascending: false })
      .limit(60),
    db.from("recovery_cases").select("recovered_amount").eq("user_id", userId).eq("customer_id", customerId),
  ]);

  return {
    id: data.id,
    external_id: data.external_id,
    name: data.name,
    email: maskEmail(data.email),
    lifetime_value: Number(data.lifetime_value),
    previous_success_count: data.previous_success_count,
    previous_failure_count: data.previous_failure_count,
    risk_level: data.risk_level,
    opted_out: data.opted_out,
    total_transactions: txs?.length ?? 0,
    recovered_amount: (cases ?? []).reduce((s, c) => s + Number(c.recovered_amount), 0),
    timeline: (txs ?? []).map((t) => ({
      id: t.id,
      transaction_ref: t.transaction_ref,
      amount: Number(t.amount),
      currency: t.currency,
      occurred_at: t.occurred_at,
      status: t.status,
      failure_reason: t.failure_reason,
      payment_method: t.payment_method,
      recovery_status: t.recovery_status,
      case_id: (t.recovery_cases as unknown as Array<{ id: string }>)[0]?.id ?? null,
    })),
  };
}

export async function loadAudit(
  db: Db,
  userId: string,
  params: {
    page?: number | undefined;
    pageSize?: number | undefined;
    type?: string | undefined;
    search?: string | undefined;
  },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 30));
  let query = db.from("audit_events").select("*", { count: "exact" }).eq("user_id", userId);
  if (params.type && params.type !== "all") query = query.eq("event_type", params.type);
  const search = params.search?.trim();
  if (search) query = query.ilike("transaction_ref", `%${search}%`);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) fail("Could not load the audit trail.");
  return { rows: data ?? [], total: count ?? 0 };
}

export interface AnalyticsData {
  trend: Array<{ date: string; atRisk: number; recovered: number; rate: number }>;
  actionPerformance: OverviewData["actionPerformance"];
  failureReasons: OverviewData["failureReasons"];
  outcomes: Array<{ outcome: string; count: number }>;
  byMethod: Array<{ method: string; atRisk: number; recovered: number }>;
  totals: {
    totalAtRisk: number;
    recoverable: number;
    attemptedAmount: number;
    recovered: number;
    recoveryRate: number;
    avgRecoveryHours: number;
    attempts: number;
    successes: number;
    failures: number;
    escalations: number;
  };
}

export async function loadAnalytics(db: Db, userId: string): Promise<AnalyticsData> {
  const [{ data: cases }, { data: attempts }, { data: txs }] = await Promise.all([
    db
      .from("recovery_cases")
      .select(
        "id, amount_at_risk, status, recovery_probability, recovered_amount, recovered_at, created_at, transaction_id",
      )
      .eq("user_id", userId),
    db.from("recovery_attempts").select("action, outcome, amount, recovered_amount, created_at, case_id").eq("user_id", userId),
    db
      .from("transactions")
      .select("id, amount, status, failure_reason, occurred_at, payment_method, recovery_status")
      .eq("user_id", userId),
  ]);

  const caseRows = cases ?? [];
  const attemptRows = attempts ?? [];
  const txRows = txs ?? [];

  const now = Date.now();
  const trendMap = new Map<string, { atRisk: number; recovered: number }>();
  for (let i = 29; i >= 0; i--) {
    trendMap.set(new Date(now - i * DAY).toISOString().slice(0, 10), { atRisk: 0, recovered: 0 });
  }
  for (const t of txRows) {
    if (!["FAILED", "ABANDONED", "RECOVERED"].includes(t.status)) continue;
    const b = trendMap.get(dayKey(t.occurred_at));
    if (b) b.atRisk += Number(t.amount);
  }
  for (const c of caseRows) {
    if (!c.recovered_at) continue;
    const b = trendMap.get(dayKey(c.recovered_at));
    if (b) b.recovered += Number(c.recovered_amount);
  }
  const trend = [...trendMap.entries()].map(([date, v]) => ({
    date,
    atRisk: Math.round(v.atRisk),
    recovered: Math.round(v.recovered),
    rate: v.atRisk > 0 ? Math.round((v.recovered / v.atRisk) * 1000) / 10 : 0,
  }));

  const actionMap = new Map<string, { attempts: number; successes: number; recovered: number }>();
  for (const a of attemptRows) {
    const entry = actionMap.get(a.action) ?? { attempts: 0, successes: 0, recovered: 0 };
    entry.attempts += 1;
    if (a.outcome === "SUCCESS") entry.successes += 1;
    entry.recovered += Number(a.recovered_amount);
    actionMap.set(a.action, entry);
  }

  const reasonMap = new Map<string, { count: number; amount: number }>();
  for (const t of txRows) {
    if (!t.failure_reason) continue;
    const e = reasonMap.get(t.failure_reason) ?? { count: 0, amount: 0 };
    e.count += 1;
    e.amount += Number(t.amount);
    reasonMap.set(t.failure_reason, e);
  }

  const outcomeMap = new Map<string, number>();
  for (const a of attemptRows) outcomeMap.set(a.outcome, (outcomeMap.get(a.outcome) ?? 0) + 1);

  const methodMap = new Map<string, { atRisk: number; recovered: number }>();
  const caseByTx = new Map(caseRows.map((c) => [c.transaction_id, c]));
  for (const t of txRows) {
    if (!["FAILED", "ABANDONED", "RECOVERED"].includes(t.status)) continue;
    const e = methodMap.get(t.payment_method) ?? { atRisk: 0, recovered: 0 };
    e.atRisk += Number(t.amount);
    e.recovered += Number(caseByTx.get(t.id)?.recovered_amount ?? 0);
    methodMap.set(t.payment_method, e);
  }

  const eligibleRevenue = caseRows.reduce((s, c) => s + Number(c.amount_at_risk), 0);
  const recovered = caseRows.reduce((s, c) => s + Number(c.recovered_amount), 0);
  const recoveredCases = caseRows.filter((c) => c.recovered_at);
  const avgRecoveryHours =
    recoveredCases.length > 0
      ? recoveredCases.reduce(
          (s, c) => s + (Date.parse(c.recovered_at!) - Date.parse(c.created_at)) / 3_600_000,
          0,
        ) / recoveredCases.length
      : 0;

  return {
    trend,
    actionPerformance: [...actionMap.entries()]
      .map(([action, v]) => ({
        action,
        label: ACTION_LABELS[action as RecoveryAction] ?? action,
        attempts: v.attempts,
        successes: v.successes,
        recovered: Math.round(v.recovered),
        rate: v.attempts > 0 ? Math.round((v.successes / v.attempts) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts),
    failureReasons: [...reasonMap.entries()]
      .map(([reason, v]) => ({ reason, count: v.count, amount: Math.round(v.amount) }))
      .sort((a, b) => b.count - a.count),
    outcomes: [...outcomeMap.entries()].map(([outcome, count]) => ({ outcome, count })),
    byMethod: [...methodMap.entries()].map(([method, v]) => ({
      method,
      atRisk: Math.round(v.atRisk),
      recovered: Math.round(v.recovered),
    })),
    totals: {
      totalAtRisk: caseRows
        .filter((c) => c.status !== "recovered")
        .reduce((s, c) => s + Number(c.amount_at_risk), 0),
      recoverable: caseRows
        .filter((c) => c.status !== "recovered" && c.recovery_probability >= 40)
        .reduce((s, c) => s + Number(c.amount_at_risk), 0),
      attemptedAmount: attemptRows.reduce((s, a) => s + Number(a.amount), 0),
      recovered,
      recoveryRate: eligibleRevenue > 0 ? (recovered / eligibleRevenue) * 100 : 0,
      avgRecoveryHours: Math.round(avgRecoveryHours * 10) / 10,
      attempts: attemptRows.length,
      successes: attemptRows.filter((a) => a.outcome === "SUCCESS").length,
      failures: attemptRows.filter((a) => a.outcome === "FAILED" || a.outcome === "NO_RESPONSE").length,
      escalations: attemptRows.filter((a) => a.outcome === "ESCALATED").length,
    },
  };
}
