import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Database, Loader2, Play } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingBlock,
  Panel,
  PageHeader,
  Pill,
  ProbabilityBar,
  formatDateTime,
  humanize,
  toneForRisk,
  toneForStatus,
} from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABELS, formatCurrency, type RecoveryAction } from "@/lib/recovery-engine";
import { getOverview, resetDemoData, runRecoveryBatchFn } from "@/lib/recoverai.functions";

const TITLE = "Revenue Recovery Overview — RecoverAI";
const DESCRIPTION =
  "Executive view of revenue at risk, recoverable revenue, recovery rate and the latest AI recovery decisions.";

export const Route = createFileRoute("/_authenticated/console/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OverviewPage,
});

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const axis = { stroke: "var(--color-muted-foreground)", fontSize: 11 } as const;

function chartTooltip() {
  return {
    contentStyle: {
      background: "var(--color-popover)",
      border: "1px solid var(--color-border)",
      borderRadius: "10px",
      fontSize: "12px",
      color: "var(--color-popover-foreground)",
    },
  };
}

function OverviewPage() {
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => getOverview() });

  const invalidateAll = () =>
    Promise.all(
      ["overview", "risk-cases", "analytics", "audit", "transactions", "customers"].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );

  const seed = useMutation({
    mutationFn: () => resetDemoData(),
    onSuccess: async (result) => {
      toast.success(
        `Dataset rebuilt: ${result.transactions} transactions, ${result.cases} recovery cases.`,
      );
      await invalidateAll();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not rebuild the demo dataset."),
  });

  const batch = useMutation({
    mutationFn: () => runRecoveryBatchFn({ data: { limit: 12 } }),
    onSuccess: async (result) => {
      toast.success(`Agent analysed ${result.analyzed} cases · ${result.blocked} blocked by guardrails.`);
      await invalidateAll();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The recovery run could not be completed."),
  });

  const data = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue recovery overview"
        description="Detect revenue at risk, diagnose why payments failed, and act within your recovery guardrails."
        actions={
          <>
            <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
              {seed.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Database className="size-4" aria-hidden />
              )}
              Rebuild demo data
            </Button>
            <Button onClick={() => batch.mutate()} disabled={batch.isPending}>
              {batch.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
              Run agent on top 12
            </Button>
          </>
        }
      />

      {overview.isError && (
        <ErrorState
          message={overview.error instanceof Error ? overview.error.message : undefined}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      )}

      {overview.isLoading && <LoadingBlock rows={6} label="Loading recovery overview" />}

      {data && data.dataset.transactions === 0 && (
        <EmptyState
          title="No payment data yet"
          description="Generate the reproducible synthetic dataset to explore the full recovery workflow."
          action={
            <Button onClick={() => seed.mutate()} disabled={seed.isPending}>
              {seed.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Generate demo dataset
            </Button>
          }
        />
      )}

      {data && data.dataset.transactions > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.kpis.map((kpi) => (
              <KpiCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                format={kpi.format}
                hint={kpi.hint}
                delta={kpi.delta}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel
              title="Revenue at risk vs recovered"
              description="Daily exposure across the last 30 days"
              className="xl:col-span-2"
            >
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.riskTrend} margin={{ left: -12, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="atRisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="recovered" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} {...axis} />
                    <YAxis tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} {...axis} />
                    <ReTooltip
                      {...chartTooltip()}
                      formatter={(value: number, name) => [formatCurrency(value), humanize(String(name))]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="atRisk"
                      name="At risk"
                      stroke="var(--color-destructive)"
                      fill="url(#atRisk)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="recovered"
                      name="Recovered"
                      stroke="var(--color-success)"
                      fill="url(#recovered)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Recovery funnel" description="Detected → diagnosed → acted → recovered">
              <ul className="space-y-3">
                {data.funnel.map((stage, index) => {
                  const max = data.funnel[0]?.count || 1;
                  return (
                    <li key={stage.stage}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{stage.stage}</span>
                        <span className="num text-muted-foreground">
                          {stage.count} · {formatCurrency(stage.amount)}
                        </span>
                      </div>
                      <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(3, (stage.count / max) * 100)}%`,
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Failure reasons" description="Where the at-risk revenue originates">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.failureReasons} margin={{ left: -12, right: 8 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="reason"
                      tickFormatter={(v: string) => humanize(v).split(" ")[0] ?? v}
                      {...axis}
                    />
                    <YAxis {...axis} />
                    <ReTooltip
                      {...chartTooltip()}
                      formatter={(value: number, name) =>
                        name === "amount" ? [formatCurrency(value), "Amount"] : [value, "Payments"]
                      }
                      labelFormatter={(label: string) => humanize(label)}
                    />
                    <Bar dataKey="count" name="count" radius={[4, 4, 0, 0]} fill="var(--color-chart-1)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Action performance" description="Simulated success rate per intervention">
              {data.actionPerformance.length === 0 ? (
                <EmptyState
                  title="No interventions executed yet"
                  description="Run the agent to generate decisions, then execute recovery actions."
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.actionPerformance}
                        dataKey="attempts"
                        nameKey="label"
                        innerRadius={52}
                        outerRadius={86}
                        paddingAngle={3}
                      >
                        {data.actionPerformance.map((entry, index) => (
                          <Cell key={entry.action} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip
                        {...chartTooltip()}
                        formatter={(value: number, _n, item) => {
                          const row = item?.payload as { rate?: number } | undefined;
                          return [`${value} attempts · ${row?.rate ?? 0}% success`, ""];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <Panel
            title="Latest AI decisions"
            description="Every recommendation is explainable and bounded by your policy"
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/console/risk">View all cases</Link>
              </Button>
            }
          >
            {data.recentDecisions.length === 0 ? (
              <EmptyState
                title="No decisions recorded"
                description="Run the agent on the highest-priority cases to populate this feed."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>At risk</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Decided</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentDecisions.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="num text-xs">{d.transaction_ref}</TableCell>
                        <TableCell className="text-xs">{d.customer}</TableCell>
                        <TableCell className="num text-xs">{formatCurrency(d.amount)}</TableCell>
                        <TableCell>
                          <Pill tone={toneForRisk(d.risk_level)}>{d.risk_level}</Pill>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ACTION_LABELS[d.recommended_action as RecoveryAction] ?? humanize(d.recommended_action)}
                          <span className="ml-1.5 text-[0.65rem] text-muted-foreground">
                            {d.source === "ai" ? "AI" : "rule-based"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ProbabilityBar value={d.confidence} />
                        </TableCell>
                        <TableCell>
                          <Pill tone={toneForStatus(d.status)}>{humanize(d.status)}</Pill>
                        </TableCell>
                        <TableCell className="num text-xs text-muted-foreground">
                          {formatDateTime(d.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          <p className="text-xs text-muted-foreground">
            Dataset: {data.dataset.transactions.toLocaleString("en-US")} transactions ·{" "}
            {data.dataset.cases.toLocaleString("en-US")} recovery cases ·{" "}
            {data.dataset.customers.toLocaleString("en-US")} customers. All values are simulated.
          </p>
        </>
      )}
    </div>
  );
}
