import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Bot, Loader2, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";

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
  toneForStatus,
} from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ACTION_LABELS, formatCurrency, type RecoveryAction } from "@/lib/recovery-engine";
import { analyzeRecoveryCase, executeRecovery, getCaseDetail } from "@/lib/recoverai.functions";

export const Route = createFileRoute("/_authenticated/console/risk/$caseId")({
  head: () => ({
    meta: [
      { title: "Recovery case — RecoverAI" },
      {
        name: "description",
        content:
          "Full diagnosis, decision history and simulated intervention outcomes for a single revenue-at-risk case.",
      },
      { property: "og:title", content: "Recovery case — RecoverAI" },
      {
        property: "og:description",
        content: "Diagnosis, AI decision history and intervention outcomes for one recovery case.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CaseDetailPage,
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => getCaseDetail({ data: { caseId } }),
  });

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["case", caseId] }),
      qc.invalidateQueries({ queryKey: ["risk-cases"] }),
      qc.invalidateQueries({ queryKey: ["overview"] }),
      qc.invalidateQueries({ queryKey: ["analytics"] }),
      qc.invalidateQueries({ queryKey: ["audit"] }),
    ]);

  const analyze = useMutation({
    mutationFn: () => analyzeRecoveryCase({ data: { caseId } }),
    onSuccess: async ({ decision }) => {
      toast.success(
        `${ACTION_LABELS[decision.recommended_action]} recommended · ${decision.recovery_probability}% modelled recovery`,
      );
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Analysis failed."),
  });

  const execute = useMutation({
    mutationFn: () => executeRecovery({ data: { caseId } }),
    onSuccess: async (result) => {
      if (result.outcome === "SUCCESS") toast.success(result.message);
      else toast.warning(result.message);
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Execution failed."),
  });

  const data = query.data;
  const latest = data?.decisions[0];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/console/risk">
          <ArrowLeft className="size-4" aria-hidden /> Back to revenue at risk
        </Link>
      </Button>

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.isLoading && <LoadingBlock rows={6} label="Loading recovery case" />}

      {data && (
        <>
          <PageHeader
            title={`Case ${data.transaction.transaction_ref}`}
            description={`${formatCurrency(data.amount_at_risk, data.transaction.currency)} at risk · ${humanize(
              data.transaction.failure_reason,
            )} · ${humanize(data.transaction.payment_method)}`}
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={() => analyze.mutate()}
                  disabled={
                    analyze.isPending || ["recovered", "stopped", "escalated"].includes(data.status)
                  }

                >
                  {analyze.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Bot className="size-4" aria-hidden />
                  )}
                  Run AI analysis
                </Button>
                <Button
                  onClick={() => execute.mutate()}
                  disabled={
                    execute.isPending ||
                    !latest ||
                    latest.recommended_action === "NO_ACTION" ||
                    ["recovered", "stopped", "escalated"].includes(data.status)
                  }
                  title={
                    !latest
                      ? "Run the analysis first"
                      : latest.recommended_action === "NO_ACTION"
                        ? "No eligible recovery action for this case"
                        : ["recovered", "stopped", "escalated"].includes(data.status)
                          ? "This case has reached a terminal state"
                          : undefined
                  }
                >
                  {execute.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Zap className="size-4" aria-hidden />
                  )}
                  Execute recovery action
                </Button>

              </>
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={toneForStatus(data.status)}>{humanize(data.status)}</Pill>
            <Pill tone={toneForRisk(data.risk_level)}>{data.risk_level} risk</Pill>
            <Pill tone="info">{data.recovery_probability}% recovery probability</Pill>
            {data.recovered_amount > 0 && (
              <Pill tone="success">Recovered {formatCurrency(data.recovered_amount)}</Pill>
            )}
            {data.stop_reason && (
              <Pill tone="warning">
                <ShieldAlert className="size-3" aria-hidden /> {humanize(data.stop_reason)}
              </Pill>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Payment" className="xl:col-span-1">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Amount" value={formatCurrency(data.transaction.amount, data.transaction.currency)} />
                <Field label="Status" value={humanize(data.transaction.status)} />
                <Field label="Method" value={humanize(data.transaction.payment_method)} />
                <Field label="Gateway retries" value={String(data.transaction.retry_count)} />
                <Field label="Failed at" value={formatDateTime(data.transaction.occurred_at)} />
                <Field label="Failure reason" value={humanize(data.transaction.failure_reason)} />
                {data.transaction.checkout_status && (
                  <Field label="Checkout" value={humanize(data.transaction.checkout_status)} />
                )}
                {data.transaction.subscription_status && (
                  <Field label="Subscription" value={humanize(data.transaction.subscription_status)} />
                )}
              </dl>
            </Panel>

            <Panel title="Customer">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Name" value={data.customer.name} />
                <Field label="Email" value={data.customer.email} />
                <Field label="Lifetime value" value={formatCurrency(data.customer.lifetime_value)} />
                <Field label="Risk level" value={humanize(data.customer.risk_level)} />
                <Field label="Successful payments" value={String(data.customer.previous_success_count)} />
                <Field label="Failed payments" value={String(data.customer.previous_failure_count)} />
                <Field label="Contact consent" value={data.customer.opted_out ? "Opted out" : "Allowed"} />
              </dl>
              <Separator className="my-4" />
              <Button asChild variant="outline" size="sm">
                <Link to="/console/customers/$customerId" params={{ customerId: data.customer.id }}>
                  View customer history
                </Link>
              </Button>
            </Panel>

            <Panel title="Intervention budget" description="Hard caps enforced server-side">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Smart retries" value={`${data.counters.retry_count} / 2`} />
                <Field label="Reminders" value={`${data.counters.reminder_count} / 2`} />
                <Field label="Alternate method" value={`${data.counters.alt_method_count} / 1`} />
                <Field label="Re-engagement" value={`${data.counters.reengagement_count} / 2`} />
              </dl>
            </Panel>
          </div>

          <Panel title="Decision history" description="Diagnosis, chosen action and reasoning per run">
            {data.decisions.length === 0 ? (
              <EmptyState
                title="No analysis yet"
                description="Run the AI analysis to produce a diagnosis and a bounded recommended action."
                action={
                  <Button onClick={() => analyze.mutate()} disabled={analyze.isPending}>
                    {analyze.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    Run AI analysis
                  </Button>
                }
              />
            ) : (
              <ol className="space-y-4">
                {data.decisions.map((decision) => (
                  <li key={decision.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="info">
                        {ACTION_LABELS[decision.recommended_action as RecoveryAction] ??
                          humanize(decision.recommended_action)}
                      </Pill>
                      <Pill tone={toneForRisk(decision.risk_level)}>{decision.risk_level}</Pill>
                      <Pill>{decision.source === "ai" ? "AI model" : "Rule-based fallback"}</Pill>
                      {decision.stop_reason && <Pill tone="warning">{humanize(decision.stop_reason)}</Pill>}
                      <span className="num ml-auto text-[0.7rem] text-muted-foreground">
                        {formatDateTime(decision.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm">{decision.diagnosis}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">{decision.reason}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        Recovery probability <ProbabilityBar value={decision.recovery_probability} />
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        Confidence <ProbabilityBar value={decision.confidence} />
                      </span>
                      {decision.next_attempt_at && (
                        <span className="num text-xs text-muted-foreground">
                          Next attempt {formatDateTime(decision.next_attempt_at)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Intervention outcomes" description="Simulated results written to the audit trail">
            {data.attempts.length === 0 ? (
              <EmptyState
                title="No interventions executed"
                description="Execute the recommended action to simulate a recovery attempt."
              />
            ) : (
              <ul className="space-y-3">
                {data.attempts.map((attempt) => (
                  <li key={attempt.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                    <Pill tone={toneForStatus(attempt.outcome)}>{humanize(attempt.outcome)}</Pill>
                    <span className="text-sm">
                      {ACTION_LABELS[attempt.action as RecoveryAction] ?? humanize(attempt.action)}
                    </span>
                    {attempt.recovered_amount > 0 && (
                      <Pill tone="success">+{formatCurrency(attempt.recovered_amount)}</Pill>
                    )}
                    {attempt.reason && (
                      <span className="text-xs text-muted-foreground">{humanize(attempt.reason)}</span>
                    )}
                    <span className="num ml-auto text-[0.7rem] text-muted-foreground">
                      {formatDateTime(attempt.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
