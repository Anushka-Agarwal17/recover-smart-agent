import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  Pill,
  ProbabilityBar,
  formatDateTime,
  humanize,
  toneForRisk,
} from "@/components/console/primitives";
import { CaseDrawer } from "@/components/console/CaseDrawer";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, formatCurrency, type RecoveryAction } from "@/lib/recovery-engine";
import { getOverview, getSettings, runRecoveryBatchFn } from "@/lib/recoverai.functions";

const TITLE = "AI Recovery Agent — RecoverAI";
const DESCRIPTION =
  "Run the recovery agent, review its reasoning, and inspect the guardrails that bound every automated decision.";

export const Route = createFileRoute("/_authenticated/console/agent")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentPage,
});

const WORKFLOW = [
  { step: "Detect", body: "Failed, abandoned and dunning payments become scored recovery cases." },
  { step: "Diagnose", body: "Failure reason, retry count, customer history and amount are combined into a diagnosis." },
  { step: "Decide", body: "The model proposes one action; the engine validates it against your policy." },
  { step: "Act", body: "The chosen intervention is simulated — no real charges or messages are sent." },
  { step: "Verify", body: "Outcome, recovered amount and reasoning are written to the audit trail." },
];

function AgentPage() {
  const qc = useQueryClient();
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => getOverview() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettings() });

  const batch = useMutation({
    mutationFn: () => runRecoveryBatchFn({ data: { limit: 15 } }),
    onSuccess: async (result) => {
      toast.success(`${result.analyzed} cases analysed · ${result.blocked} blocked by guardrails.`);
      await Promise.all(
        ["overview", "risk-cases", "audit", "analytics"].map((key) =>
          qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The agent run failed."),
  });

  const rules = settings.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI recovery agent"
        description="A bounded decision engine: the model reasons, the engine enforces the rules, and nothing runs outside them."
        actions={
          <Button onClick={() => batch.mutate()} disabled={batch.isPending}>
            {batch.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Run agent on top 15 cases
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Workflow" description="Each stage is auditable" className="xl:col-span-2">
          <ol className="grid gap-4 sm:grid-cols-5">
            {WORKFLOW.map((item, index) => (
              <li key={item.step}>
                <span className="num text-xs text-primary">0{index + 1}</span>
                <p className="mt-1 text-sm font-medium">{item.step}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Active guardrails" description="Enforced server-side on every decision">
          {settings.isLoading && <LoadingBlock rows={3} label="Loading guardrails" />}
          {rules && (
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                Max {rules.max_retries} smart retries per case
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                {rules.recovery_window_hours}h recovery window
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                Stop below {rules.min_recovery_probability}% recovery probability
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                Max {rules.max_interventions} interventions per case
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                Escalate above {formatCurrency(rules.escalation_threshold_amount)}
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                Opted-out customers are never contacted
              </li>
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Reasoning feed" description="The agent's most recent decisions with confidence and source">
        {overview.isError && (
          <ErrorState
            message={overview.error instanceof Error ? overview.error.message : undefined}
            onRetry={() => void overview.refetch()}
            retrying={overview.isFetching}
          />
        )}
        {overview.isLoading && <LoadingBlock rows={5} label="Loading agent decisions" />}
        {overview.data?.recentDecisions.length === 0 && (
          <EmptyState
            title="The agent hasn't run yet"
            description="Start a run to generate diagnoses and bounded recommendations."
            action={
              <Button onClick={() => batch.mutate()} disabled={batch.isPending}>
                {batch.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Run the agent
              </Button>
            }
          />
        )}
        <ul className="space-y-3">
          {overview.data?.recentDecisions.map((decision) => (
            <li
              key={decision.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveCaseId(decision.case_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveCaseId(decision.case_id);
                }
              }}
              className="cursor-pointer rounded-xl border border-border p-4 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Bot className="size-4 text-primary" aria-hidden />
                <span className="num text-xs">{decision.transaction_ref}</span>
                <Pill tone="info">
                  {ACTION_LABELS[decision.recommended_action as RecoveryAction] ??
                    humanize(decision.recommended_action)}
                </Pill>
                <Pill tone={toneForRisk(decision.risk_level)}>{decision.risk_level}</Pill>
                <Pill>{decision.source === "ai" ? "AI model" : "Rule-based fallback"}</Pill>
                <span className="num ml-auto text-[0.7rem] text-muted-foreground">
                  {formatDateTime(decision.created_at)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {decision.customer} · {formatCurrency(decision.amount)} at risk
                </span>
                <span className="flex items-center gap-2">
                  Confidence <ProbabilityBar value={decision.confidence} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <CaseDrawer caseId={activeCaseId} onClose={() => setActiveCaseId(null)} />
    </div>
  );
}
