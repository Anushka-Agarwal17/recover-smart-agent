import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureWorkspace } = await import("./workspace.server");
    const email = typeof context.claims["email"] === "string" ? context.claims["email"] : undefined;
    return ensureWorkspace(context.supabase, context.userId, email);
  });

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadOverview } = await import("./queries.server");
    return loadOverview(context.supabase, context.userId);
  });

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadAnalytics } = await import("./queries.server");
    return loadAnalytics(context.supabase, context.userId);
  });

export const listRiskCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        risk: z.string().optional(),
        kind: z.string().optional(),
        status: z.string().optional(),
        minAmount: z.number().nonnegative().optional(),
        maxAmount: z.number().nonnegative().optional(),
        search: z.string().max(120).optional(),
        page: z.number().int().min(1).max(500).optional(),
        pageSize: z.number().int().min(5).max(100).optional(),
        sort: z.enum(["priority", "amount", "probability", "recent"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadRiskCases } = await import("./queries.server");
    return loadRiskCases(context.supabase, context.userId, data);
  });

export const getCaseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ caseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { loadCaseDetail } = await import("./queries.server");
    return loadCaseDetail(context.supabase, context.userId, data.caseId);
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(500).optional(),
        pageSize: z.number().int().min(5).max(100).optional(),
        status: z.string().optional(),
        method: z.string().optional(),
        search: z.string().max(120).optional(),
        sort: z.enum(["recent", "amount"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadTransactions } = await import("./queries.server");
    return loadTransactions(context.supabase, context.userId, data);
  });

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(500).optional(),
        pageSize: z.number().int().min(5).max(100).optional(),
        search: z.string().max(120).optional(),
        risk: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadCustomers } = await import("./queries.server");
    return loadCustomers(context.supabase, context.userId, data);
  });

export const getCustomerDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { loadCustomerDetail } = await import("./queries.server");
    return loadCustomerDetail(context.supabase, context.userId, data.customerId);
  });

export const listAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(500).optional(),
        pageSize: z.number().int().min(10).max(100).optional(),
        type: z.string().optional(),
        search: z.string().max(120).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadAudit } = await import("./queries.server");
    return loadAudit(context.supabase, context.userId, data);
  });

export const analyzeRecoveryCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ caseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { analyzeCase } = await import("./agent.server");
    const { loadRules } = await import("./workspace.server");
    const rules = await loadRules(context.supabase, context.userId);
    return analyzeCase(context.supabase, context.userId, data.caseId, rules);
  });

export const runRecoveryBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(25).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { runRecoveryBatch } = await import("./agent.server");
    const { loadRules } = await import("./workspace.server");
    const rules = await loadRules(context.supabase, context.userId);
    return runRecoveryBatch(context.supabase, context.userId, rules, data.limit ?? 12);
  });

export const executeRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ caseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { executeRecoveryAction } = await import("./agent.server");
    const { loadRules } = await import("./workspace.server");
    const rules = await loadRules(context.supabase, context.userId);
    return executeRecoveryAction(context.supabase, context.userId, data.caseId, rules);
  });

export const resetDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { regenerateDemoData } = await import("./demo-data.server");
    const { ensureWorkspace } = await import("./workspace.server");
    const email = typeof context.claims["email"] === "string" ? context.claims["email"] : undefined;
    const workspace = await ensureWorkspace(context.supabase, context.userId, email);
    return regenerateDemoData(context.supabase, context.userId, workspace.rules);
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadRules } = await import("./workspace.server");
    return loadRules(context.supabase, context.userId);
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        max_retries: z.number().int().min(0).max(2),
        recovery_window_hours: z.number().int().min(1).max(720),
        min_recovery_probability: z.number().int().min(10).max(90),
        max_interventions: z.number().int().min(1).max(6),
        escalation_threshold_amount: z.number().min(50).max(100000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { writeAudit } = await import("./db.server");
    const { error } = await context.supabase
      .from("merchant_settings")
      .upsert({ user_id: context.userId, ...data });
    if (error) throw new Error("Settings could not be saved. Please try again.");
    await writeAudit(context.supabase, context.userId, [
      {
        event_type: "SETTINGS_UPDATED",
        actor: "merchant",
        action: "UPDATE_RECOVERY_POLICY",
        reason: `max_retries=${data.max_retries}, window=${data.recovery_window_hours}h, min_probability=${data.min_recovery_probability}%`,
        result: "applied",
      },
    ]);
    return data;
  });
