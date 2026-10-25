import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  Pill,
  formatDateTime,
  humanize,
  toneForRisk,
  toneForStatus,
} from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/recovery-engine";
import { getCustomerDetail } from "@/lib/recoverai.functions";

export const Route = createFileRoute("/_authenticated/console/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer history — RecoverAI" },
      {
        name: "description",
        content: "Payment timeline, recovery outcomes and reliability signals for a single customer.",
      },
      { property: "og:title", content: "Customer history — RecoverAI" },
      {
        property: "og:description",
        content: "Payment timeline and recovery outcomes for a single customer.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerDetailPage,
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="text-[0.7rem] text-muted-foreground">{label}</p>
      <p className="num mt-1.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const query = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => getCustomerDetail({ data: { customerId } }),
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/console/customers">
          <ArrowLeft className="size-4" aria-hidden /> Back to customers
        </Link>
      </Button>

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.isLoading && <LoadingBlock rows={6} label="Loading customer" />}

      {data && (
        <>
          <PageHeader
            title={data.name}
            description={`${data.external_id} · ${data.email} · ${data.opted_out ? "opted out of outreach" : "outreach allowed"}`}
            actions={<Pill tone={toneForRisk(data.risk_level)}>{data.risk_level} risk</Pill>}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Lifetime value" value={formatCurrency(data.lifetime_value)} />
            <Stat label="Recovered revenue" value={formatCurrency(data.recovered_amount)} />
            <Stat label="Successful payments" value={String(data.previous_success_count)} />
            <Stat label="Failed payments" value={String(data.previous_failure_count)} />
          </div>

          <Panel title="Payment timeline" description="Most recent 60 payment events">
            {data.timeline.length === 0 ? (
              <EmptyState title="No payments yet" description="This customer has no recorded transactions." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Failure</TableHead>
                      <TableHead>Recovery</TableHead>
                      <TableHead>Occurred</TableHead>
                      <TableHead className="text-right">Case</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.timeline.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="num text-xs">{tx.transaction_ref}</TableCell>
                        <TableCell className="num text-xs">{formatCurrency(tx.amount, tx.currency)}</TableCell>
                        <TableCell className="text-xs">{humanize(tx.payment_method)}</TableCell>
                        <TableCell>
                          <Pill tone={toneForStatus(tx.status)}>{humanize(tx.status)}</Pill>
                        </TableCell>
                        <TableCell className="text-xs">{humanize(tx.failure_reason)}</TableCell>
                        <TableCell className="text-xs">{humanize(tx.recovery_status)}</TableCell>
                        <TableCell className="num text-xs text-muted-foreground">
                          {formatDateTime(tx.occurred_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          {tx.case_id ? (
                            <Button asChild size="sm" variant="outline">
                              <Link to="/console/risk/$caseId" params={{ caseId: tx.case_id }}>
                                Open
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
