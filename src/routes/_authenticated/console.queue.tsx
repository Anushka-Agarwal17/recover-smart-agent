import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  Pill,
  ProbabilityBar,
  humanize,
  relativeTime,
  toneForRisk,
  toneForStatus,
} from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, formatCurrency, type RecoveryAction } from "@/lib/recovery-engine";
import {
  analyzeRecoveryCase,
  executeRecovery,
  listRiskCases,
  runRecoveryBatchFn,
} from "@/lib/recoverai.functions";

const TITLE = "Recovery Queue — RecoverAI";
const DESCRIPTION =
  "Work the highest-priority recovery cases: analyse, execute a bounded action and verify the simulated outcome.";

export const Route = createFileRoute("/_authenticated/console/queue")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const qc = useQueryClient();
  const filters = { status: "open", sort: "priority" as const, page: 1, pageSize: 15 };
  const query = useQuery({
    queryKey: ["risk-cases", "queue", filters],
    queryFn: () => listRiskCases({ data: filters }),
  });

  const refresh = () =>
    Promise.all(
      ["risk-cases", "overview", "analytics", "audit"].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );

  const batch = useMutation({
    mutationFn: () => runRecoveryBatchFn({ data: { limit: 15 } }),
    onSuccess: async (result) => {
      toast.success(`${result.analyzed} cases analysed · ${result.blocked} blocked by guardrails.`);
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Batch run failed."),
  });

  const analyze = useMutation({
    mutationFn: (caseId: string) => analyzeRecoveryCase({ data: { caseId } }),
    onSuccess: async ({ decision }) => {
      toast.success(`${ACTION_LABELS[decision.recommended_action]} recommended.`);
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Analysis failed."),
  });

  const execute = useMutation({
    mutationFn: (caseId: string) => executeRecovery({ data: { caseId } }),
    onSuccess: async (result) => {
      if (result.outcome === "SUCCESS") toast.success(result.message);
      else toast.warning(result.message);
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Execution failed."),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recovery queue"
        description="Open cases ordered by priority. Every action is simulated and capped by your recovery policy."
        actions={
          <Button onClick={() => batch.mutate()} disabled={batch.isPending}>
            {batch.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Bot className="size-4" aria-hidden />
            )}
            Analyse queue
          </Button>
        }
      />

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.isLoading && <LoadingBlock rows={6} label="Loading recovery queue" />}

      {query.data?.rows.length === 0 && (
        <EmptyState
          title="Queue is clear"
          description="No open recovery cases remain. Rebuild the dataset or check stopped and escalated cases."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {query.data?.rows.map((row) => (
          <Panel key={row.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="num text-xs text-muted-foreground">{row.transaction_ref}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">
                  {formatCurrency(row.amount_at_risk, row.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.customer_name} · {humanize(row.failure_reason)} · {relativeTime(row.occurred_at)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Pill tone={toneForRisk(row.risk_level)}>{row.risk_level}</Pill>
                <Pill tone={toneForStatus(row.status)}>{humanize(row.status)}</Pill>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Probability <ProbabilityBar value={row.recovery_probability} />
              </span>
              <span className="text-xs text-muted-foreground">
                Priority <span className="num">{Math.round(row.priority_score)}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {row.previous_success_count} prior successes
              </span>
            </div>

            <p className="text-xs">
              <span className="text-muted-foreground">Recommended:</span>{" "}
              {row.recommended_action
                ? (ACTION_LABELS[row.recommended_action as RecoveryAction] ?? humanize(row.recommended_action))
                : "Not analysed yet"}
            </p>

            <div className="mt-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => analyze.mutate(row.id)}
                disabled={analyze.isPending}
              >
                {analyze.isPending && analyze.variables === row.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Bot className="size-4" aria-hidden />
                )}
                Analyse
              </Button>
              <Button
                size="sm"
                onClick={() => execute.mutate(row.id)}
                disabled={execute.isPending || !row.recommended_action}
              >
                {execute.isPending && execute.variables === row.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Zap className="size-4" aria-hidden />
                )}
                Execute
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/console/risk/$caseId" params={{ caseId: row.id }}>
                  Details
                </Link>
              </Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
