import { z } from "zod";

import {
  RECOVERY_ACTIONS,
  type CaseFeatures,
  type EngineDecision,
  type MerchantRules,
} from "./recovery-engine";

const decisionSchema = z.object({
  diagnosis: z.string().min(10).max(600),
  recovery_probability: z.number(),
  risk_level: z.enum(["low", "medium", "high"]),
  recommended_action: z.enum(RECOVERY_ACTIONS),
  reason: z.string().min(10).max(600),
  confidence: z.number(),
});

export interface AiDecisionInput {
  transaction_ref: string;
  amount: number;
  currency: string;
  payment_method: string;
  failure_reason: string | null;
  hours_since_failure: number;
  features: CaseFeatures;
  computed_probability: number;
  rules: MerchantRules;
  allowed_actions: readonly string[];
  guardrail_stop_reason: string | null;
}

const SYSTEM_PROMPT = `You are the decision core of a payment revenue recovery system.
You receive structured facts about a single failed or abandoned payment and must return a bounded recovery decision.
Rules you must obey:
- Only use the facts provided. Never invent customer details, communications, or history.
- recommended_action MUST be exactly one of the allowed_actions values.
- If guardrail_stop_reason is not null, recommended_action must be NO_ACTION or ESCALATE.
- Respect merchant rules: never recommend SMART_RETRY when retry_count >= max_retries, never recommend PAYMENT_REMINDER when reminder_count >= 2, never recommend CHECKOUT_REENGAGEMENT when reengagement_count >= 2.
- recovery_probability and confidence are integers between 0 and 100. Stay within 12 points of computed_probability.
- reason must cite the concrete numbers that drove the choice.
Respond with JSON only, using keys: diagnosis, recovery_probability, risk_level, recommended_action, reason, confidence.`;

/**
 * Calls the AI model server-side and validates the structured output.
 * Returns null on any transport, parsing or validation failure so the caller
 * can fall back to deterministic rule-based logic.
 */
export async function requestAiDecision(
  input: AiDecisionInput,
): Promise<Omit<EngineDecision, "next_attempt_at" | "stop_reason"> | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[recoverai] ai gateway error", response.status, body.slice(0, 500));
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = decisionSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.error("[recoverai] invalid ai decision shape", parsed.error.message);
      return null;
    }

    const value = parsed.data;
    // Guardrail: the model may only pick bounded actions, and probabilities are clamped.
    if (!input.allowed_actions.includes(value.recommended_action)) {
      console.error("[recoverai] ai proposed a disallowed action", value.recommended_action);
      return null;
    }

    return {
      diagnosis: value.diagnosis,
      recovery_probability: Math.max(0, Math.min(100, Math.round(value.recovery_probability))),
      risk_level: value.risk_level,
      recommended_action: value.recommended_action,
      reason: value.reason,
      confidence: Math.max(0, Math.min(100, Math.round(value.confidence))),
      source: "ai",
    };
  } catch (error) {
    console.error("[recoverai] ai request failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
