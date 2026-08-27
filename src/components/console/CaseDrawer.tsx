import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react";

import {
  ErrorState,
  LoadingBlock,
  Pill,
  ProbabilityBar,
  formatDateTime,
  humanize,
  toneForRisk,
  toneForStatus,
} from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ACTION_LABELS,
  ACTION_LIMITS,
  DEFAULT_RULES,
  formatCurrency,
  type MerchantRules,
  type RecoveryAction,
} from "@/lib/recovery-engine";
import { getCaseDetail, getSettings, listAuditEvents } from "@/lib/recoverai.functions";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{value}</dd>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

interface GuardrailCheck {
  label: string;
  detail: string;
  passed: boolean;
}

function buildGuardrails(
  data: NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>,
  rules: MerchantRules,
): GuardrailCheck[] {
  const c = data.counters;
  const interventions = c.retry_count + c.reminder_count + c.reengagement_count + c.alt_method_count;
  const hoursSince = (Date.now() - Date.parse(data.transaction.occurred_at)) / 3_600_000;

  return [
    {
      label: "Customer contact consent",
      detail: data.customer.opted_out ? "Customer has opted out of recovery contact" : "Contact permitted",
      passed: !data.customer.opted_out,
    },
    {
      label: "Recovery window",
      detail: `${Math.round(hoursSince)}h since failure · limit ${rules.recovery_window_hours}h`,
      passed: hoursSince <= rules.recovery_window_hours,
    },
    {
      label: "Smart retry cap",
      detail: `${c.retry_count} used · max ${rules.max_retries}`,
      passed: c.retry_count < rules.max_retries,
    },
    {
      label: "Reminder cap",
      detail: `${c.reminder_count} used · max ${ACTION_LIMITS.PAYMENT_REMINDER.max}`,
      passed: c.reminder_count < ACTION_LIMITS.PAYMENT_REMINDER.max,
    },
    {
      label: "Alternate method cap",
      detail: `${c.alt_method_count} used · max ${ACTION_LIMITS.ALTERNATE_PAYMENT_METHOD.max}`,
      passed: c.alt_method_count < ACTION_LIMITS.ALTERNATE_PAYMENT_METHOD.max,
    },
    {
      label: "Re-engagement cap",
      detail: `${c.reengagement_count} used · max ${ACTION_LIMITS.CHECKOUT_REENGAGEMENT.max}`,
      passed: c.reengagement_count < ACTION_LIMITS.CHECKOUT_REENGAGEMENT.max,
    },
    {
      label: "Total intervention budget",
      detail: `${interventions} used · max ${rules.max_interventions}`,
      passed: interventions < rules.max_interventions,
    },
    {
      label: "Minimum recovery probability",
      detail: `${data.recovery_probability}% modelled · threshold ${rules.min_recovery_probability}%`,
      passed: data.recovery_probability >= rules.min_recovery_probability,
    },
    {
      label: "Escalation threshold",
      detail: `${formatCurrency(data.amount_at_risk)} at risk · escalate above ${formatCurrency(
        rules.escalation_threshold_amount,
      )}`,
      passed: data.amount_at_risk <= rules.escalation_threshold_amount,
    },
    {
      label: "Case still recoverable",
      detail: `Case status ${humanize(data.status)}`,
      passed: data.status !== "recovered" && data.status !== "escalated",
    },
  ];
}

export function CaseDrawer({ caseId, onClose }: { caseId: string | null; onClose: () => void }) {
  const open = caseId != null;

  const query = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => getCaseDetail({ data: { caseId: caseId as string } }),
    enabled: open,
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettings(), enabled: open });

  const ref = query.data?.transaction.transaction_ref;
  const audit = useQuery({
    queryKey: ["audit", "case", ref],
    queryFn: () => listAuditEvents({ data: { search: ref as string, page: 1, pageSize: 20 } }),
    enabled: open && !!ref,
  });

  const data = query.data;
  const latest = data?.decisions[0];
  const attempt = data?.attempts[0];
  const guardrails = data ? buildGuardrails(data, settings.data ?? DEFAULT_RULES) : [];

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl lg:max-w-2xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="num text-base">
            {data ? `Case ${data.transaction.transaction_ref}` : "Recovery case"}
          </SheetTitle>
          <SheetDescription>
            {data
              ? `${formatCurrency(data.amount_at_risk, data.transaction.currency)} at risk · ${humanize(
                  data.transaction.failure_reason,
                )}`
              : "Full diagnosis, guardrail checks and outcome for this case."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {query.isError && (
            <ErrorState
              message={query.error instanceof Error ? query.error.message : undefined}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )}
          {query.isLoading && <LoadingBlock rows={6} label="Loading case details" />}

          {data && (
            <>
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

              <Section title="Transaction">
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Transaction ID" value={data.transaction.transaction_ref} />
                  <Field
                    label="Amount"
                    value={formatCurrency(data.transaction.amount, data.transaction.currency)}
                  />
                  <Field
                    label="Amount at risk"
                    value={formatCurrency(data.amount_at_risk, data.transaction.currency)}
                  />
                  <Field label="Payment method" value={humanize(data.transaction.payment_method)} />
                  <Field label="Failure reason" value={humanize(data.transaction.failure_reason)} />
                  <Field label="Gateway retry count" value={String(data.transaction.retry_count)} />
                  <Field label="Status" value={humanize(data.transaction.status)} />
                  <Field label="Occurred" value={formatDateTime(data.transaction.occurred_at)} />
                  {data.transaction.checkout_status && (
                    <Field label="Checkout" value={humanize(data.transaction.checkout_status)} />
                  )}
                  {data.transaction.subscription_status && (
                    <Field label="Subscription" value={humanize(data.transaction.subscription_status)} />
                  )}
                </dl>
              </Section>

              <Section title="Customer history">
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Customer" value={data.customer.name} />
                  <Field label="Email" value={data.customer.email} />
                  <Field label="Lifetime value" value={formatCurrency(data.customer.lifetime_value)} />
                  <Field label="Customer risk" value={humanize(data.customer.risk_level)} />
                  <Field label="Prior successes" value={String(data.customer.previous_success_count)} />
                  <Field label="Prior failures" value={String(data.customer.previous_failure_count)} />
                  <Field
                    label="Contact consent"
                    value={data.customer.opted_out ? "Opted out" : "Allowed"}
                  />
                </dl>
                <Separator className="my-4" />
                <Button asChild variant="outline" size="sm">
                  <Link to="/console/customers/$customerId" params={{ customerId: data.customer.id }}>
                    View customer profile
                  </Link>
                </Button>
              </Section>

              <Section title="AI diagnosis & decision" description="Latest run for this case">
                {latest ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="info">
                        {ACTION_LABELS[latest.recommended_action as RecoveryAction] ??
                          humanize(latest.recommended_action)}
                      </Pill>
                      <Pill tone={toneForRisk(latest.risk_level)}>{latest.risk_level}</Pill>
                      <Pill>{latest.source === "ai" ? "AI model" : "Rule-based fallback"}</Pill>
                      {latest.stop_reason && <Pill tone="warning">{humanize(latest.stop_reason)}</Pill>}
                      <span className="num ml-auto text-[0.7rem] text-muted-foreground">
                        {formatDateTime(latest.created_at)}
                      </span>
                    </div>
                    <p className="text-sm">{latest.diagnosis}</p>
                    <p className="text-xs text-muted-foreground">{latest.reason}</p>
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        Recovery probability <ProbabilityBar value={latest.recovery_probability} />
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        Confidence <ProbabilityBar value={latest.confidence} />
                      </span>
                      {latest.next_attempt_at && (
                        <span className="num text-xs text-muted-foreground">
                          Next attempt {formatDateTime(latest.next_attempt_at)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No analysis yet. Run the agent to generate a diagnosis and a bounded action.
                  </p>
                )}
              </Section>

              <Section title="Guardrail checks" description="Evaluated server-side before any action runs">
                <ul className="space-y-2">
                  {guardrails.map((check) => (
                    <li key={check.label} className="flex items-start gap-2.5 text-xs">
                      {check.passed ? (
                        <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                      ) : (
                        <X className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                      )}
                      <span className="flex-1">
                        <span className="text-sm">{check.label}</span>
                        <span className="block text-muted-foreground">{check.detail}</span>
                      </span>
                      <Pill tone={check.passed ? "success" : "danger"}>
                        {check.passed ? "Passed" : "Blocked"}
                      </Pill>
                    </li>
                  ))}
                </ul>
                <Separator className="my-4" />
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-success" aria-hidden />
                  Final decision:{" "}
                  <span className="text-foreground">
                    {data.recommended_action
                      ? (ACTION_LABELS[data.recommended_action as RecoveryAction] ??
                        humanize(data.recommended_action))
                      : "Awaiting analysis"}
                  </span>
                  {data.stop_reason && <span>· stopped by {humanize(data.stop_reason)}</span>}
                </p>
              </Section>

              <Section title="Simulated outcome" description="No real charges or messages are ever sent">
                {attempt ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={toneForStatus(attempt.outcome)}>{humanize(attempt.outcome)}</Pill>
                      <span className="text-sm">
                        {ACTION_LABELS[attempt.action as RecoveryAction] ?? humanize(attempt.action)}
                      </span>
                      {attempt.recovered_amount > 0 && (
                        <Pill tone="success">+{formatCurrency(attempt.recovered_amount)} recovered</Pill>
                      )}
                      <span className="num ml-auto text-[0.7rem] text-muted-foreground">
                        {formatDateTime(attempt.created_at)}
                      </span>
                    </div>
                    {attempt.reason && (
                      <p className="text-xs text-muted-foreground">{humanize(attempt.reason)}</p>
                    )}
                    {data.attempts.length > 1 && (
                      <ul className="space-y-1.5 text-xs text-muted-foreground">
                        {data.attempts.slice(1).map((prev) => (
                          <li key={prev.id} className="flex flex-wrap items-center gap-2">
                            <Pill tone={toneForStatus(prev.outcome)}>{humanize(prev.outcome)}</Pill>
                            {ACTION_LABELS[prev.action as RecoveryAction] ?? humanize(prev.action)}
                            <span className="num ml-auto">{formatDateTime(prev.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No intervention executed for this case yet.</p>
                )}
              </Section>

              <Section title="Audit trail" description="Append-only record for this transaction">
                {audit.isLoading && <LoadingBlock rows={3} label="Loading audit trail" />}
                {audit.data && audit.data.rows.length === 0 && (
                  <p className="text-xs text-muted-foreground">No audit entries recorded yet.</p>
                )}
                <ul className="space-y-2">
                  {audit.data?.rows.map((event) => (
                    <li key={event.id} className="rounded-lg border border-border p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="info">{humanize(event.event_type)}</Pill>
                        <span className="text-muted-foreground">{humanize(event.actor)}</span>
                        {event.result && <Pill tone={toneForStatus(event.result)}>{humanize(event.result)}</Pill>}
                        <span className="num ml-auto text-[0.7rem] text-muted-foreground">
                          {formatDateTime(event.created_at)}
                        </span>
                      </div>
                      {(event.action || event.reason) && (
                        <p className="mt-2 text-muted-foreground">
                          {event.action ? `${humanize(event.action)} — ` : ""}
                          {event.reason}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>

              <Button asChild variant="outline" size="sm" className="w-fit">
                <Link to="/console/risk/$caseId" params={{ caseId: data.id }} onClick={onClose}>
                  Open full case page
                </Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
