import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  humanize,
} from "@/components/console/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/recovery-engine";
import { getAnalytics } from "@/lib/recoverai.functions";

const TITLE = "Recovery Analytics — RecoverAI";
const DESCRIPTION =
  "Recovery rate over time, intervention performance, outcome distribution and revenue at risk by payment method.";

export const Route = createFileRoute("/_authenticated/console/analytics")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnalyticsPage,
});

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
const axis = { stroke: "var(--color-muted-foreground)", fontSize: 11 } as const;
const tooltipStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    fontSize: "12px",
    color: "var(--color-popover-foreground)",
  },
} as const;

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel p-4">
      <p className="text-[0.7rem] text-muted-foreground">{label}</p>
      <p className="num mt-1.5 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">{hint}</p>
    </div>
  );
}

function AnalyticsPage() {
  const query = useQuery({ queryKey: ["analytics"], queryFn: () => getAnalytics() });
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recovery analytics"
        description="How much exposure the agent converted, which interventions worked, and where failures concentrate."
      />

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.isLoading && <LoadingBlock rows={6} label="Loading analytics" />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Revenue recovered"
              value={formatCurrency(data.totals.recovered)}
              hint={`${data.totals.successes} successful interventions`}
            />
            <Stat
              label="Recovery rate"
              value={`${data.totals.recoveryRate.toFixed(1)}%`}
              hint="Recovered ÷ eligible at-risk revenue"
            />
            <Stat
              label="Still at risk"
              value={formatCurrency(data.totals.totalAtRisk)}
              hint={`${formatCurrency(data.totals.recoverable)} modelled as recoverable`}
            />
            <Stat
              label="Avg time to recovery"
              value={`${data.totals.avgRecoveryHours}h`}
              hint={`${data.totals.attempts} attempts · ${data.totals.escalations} escalations`}
            />
          </div>

          <Panel title="Recovery rate trend" description="Daily at-risk revenue, recovered revenue and rate">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} {...axis} />
                  <YAxis yAxisId="left" tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} {...axis} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v: number) => `${v}%`}
                    {...axis}
                  />
                  <ReTooltip
                    {...tooltipStyle}
                    formatter={(value: number, name) =>
                      name === "Rate" ? [`${value}%`, name] : [formatCurrency(value), String(name)]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="atRisk"
                    name="At risk"
                    stroke="var(--color-destructive)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="recovered"
                    name="Recovered"
                    stroke="var(--color-success)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rate"
                    name="Rate"
                    stroke="var(--color-primary)"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="At risk by payment method" description="Exposure vs recovered revenue">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byMethod} margin={{ left: -12, right: 8 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="method" tickFormatter={(v: string) => humanize(v)} {...axis} />
                    <YAxis tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} {...axis} />
                    <ReTooltip
                      {...tooltipStyle}
                      formatter={(value: number, name) => [formatCurrency(value), String(name)]}
                      labelFormatter={(label: string) => humanize(label)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="atRisk" name="At risk" radius={[4, 4, 0, 0]} fill="var(--color-chart-1)" />
                    <Bar dataKey="recovered" name="Recovered" radius={[4, 4, 0, 0]} fill="var(--color-chart-2)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Outcome distribution" description="Results of every simulated intervention">
              {data.outcomes.length === 0 ? (
                <EmptyState
                  title="No outcomes yet"
                  description="Execute recovery actions from the queue to populate this chart."
                />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.outcomes}
                        dataKey="count"
                        nameKey="outcome"
                        innerRadius={56}
                        outerRadius={92}
                        paddingAngle={3}
                      >
                        {data.outcomes.map((entry, index) => (
                          <Cell key={entry.outcome} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip
                        {...tooltipStyle}
                        formatter={(value: number, name) => [`${value} attempts`, humanize(String(name))]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(value: string) => humanize(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Intervention performance" description="Success rate and recovered revenue per action">
            {data.actionPerformance.length === 0 ? (
              <EmptyState
                title="No interventions executed"
                description="Run the agent and execute actions to measure performance."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Successes</TableHead>
                      <TableHead>Success rate</TableHead>
                      <TableHead>Revenue recovered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.actionPerformance.map((row) => (
                      <TableRow key={row.action}>
                        <TableCell className="text-xs">{row.label}</TableCell>
                        <TableCell className="num text-xs">{row.attempts}</TableCell>
                        <TableCell className="num text-xs">{row.successes}</TableCell>
                        <TableCell className="num text-xs">{row.rate}%</TableCell>
                        <TableCell className="num text-xs">{formatCurrency(row.recovered)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          <Panel title="Failure reasons" description="Volume and value by root cause">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead>Payments</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.failureReasons.map((row) => (
                    <TableRow key={row.reason}>
                      <TableCell className="text-xs">{humanize(row.reason)}</TableCell>
                      <TableCell className="num text-xs">{row.count}</TableCell>
                      <TableCell className="num text-xs">{formatCurrency(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
