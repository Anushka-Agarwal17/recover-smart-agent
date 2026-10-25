import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABELS, formatCurrency, type RecoveryAction } from "@/lib/recovery-engine";
import { listRiskCases } from "@/lib/recoverai.functions";

const TITLE = "Revenue at Risk — RecoverAI";
const DESCRIPTION =
  "Prioritised list of failed, abandoned and dunning payments with modelled recovery probability and recommended action.";

export const Route = createFileRoute("/_authenticated/console/risk/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiskPage,
});

const PAGE_SIZE = 20;

function RiskPage() {
  const [risk, setRisk] = useState("all");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState<"priority" | "amount" | "probability" | "recent">("priority");
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [page, setPage] = useState(1);

  const filters = {
    risk,
    status,
    kind,
    sort,
    search: search.trim() || undefined,
    minAmount: minAmount ? Number(minAmount) : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const query = useQuery({
    queryKey: ["risk-cases", filters],
    queryFn: () => listRiskCases({ data: filters }),
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));
  const reset = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue at risk"
        description="Cases are scored by amount, recovery probability, customer history and time since failure."
      />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="risk-search">Transaction reference</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="risk-search"
                className="pl-9"
                placeholder="TXN-..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="risk-level">Risk level</Label>
            <Select value={risk} onValueChange={reset(setRisk)}>
              <SelectTrigger id="risk-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk levels</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="risk-status">Case status</Label>
            <Select value={status} onValueChange={reset(setStatus)}>
              <SelectTrigger id="risk-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="recovered">Recovered</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="risk-kind">Failure type</Label>
            <Select value={kind} onValueChange={reset(setKind)}>
              <SelectTrigger id="risk-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All failure types</SelectItem>
                <SelectItem value="insufficient_funds">Insufficient funds</SelectItem>
                <SelectItem value="bank_declined">Bank declined</SelectItem>
                <SelectItem value="network_error">Network error</SelectItem>
                <SelectItem value="authentication_failed">Authentication failed</SelectItem>
                <SelectItem value="expired_card">Expired card</SelectItem>
                <SelectItem value="checkout_abandoned">Checkout abandoned</SelectItem>
                <SelectItem value="subscription_failed">Subscription failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="risk-min">Min amount</Label>
              <Input
                id="risk-min"
                type="number"
                min={0}
                placeholder="0"
                value={minAmount}
                onChange={(e) => {
                  setMinAmount(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="risk-sort">Sort</Label>
              <Select value={sort} onValueChange={reset(setSort) as (v: string) => void}>
                <SelectTrigger id="risk-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="probability">Probability</SelectItem>
                  <SelectItem value="recent">Most recent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Panel>

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {query.isLoading && <LoadingBlock rows={8} label="Loading revenue at risk" />}

      {query.data && query.data.rows.length === 0 && (
        <EmptyState
          title="No cases match these filters"
          description="Widen the filters or rebuild the demo dataset from the overview page."
        />
      )}

      {query.data && query.data.rows.length > 0 && (
        <Panel
          title={`${query.data.total.toLocaleString("en-US")} cases`}
          description="Highest-priority exposure first"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>At risk</TableHead>
                  <TableHead>Failure</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Recommended</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead className="text-right">Case</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="num text-xs">{Math.round(row.priority_score)}</TableCell>
                    <TableCell className="num text-xs">{row.transaction_ref}</TableCell>
                    <TableCell className="text-xs">
                      <span className="block">{row.customer_name}</span>
                      <span className="text-[0.65rem] text-muted-foreground">{row.customer_email}</span>
                    </TableCell>
                    <TableCell className="num text-xs">{formatCurrency(row.amount_at_risk, row.currency)}</TableCell>
                    <TableCell className="text-xs">{humanize(row.failure_reason)}</TableCell>
                    <TableCell>
                      <ProbabilityBar value={row.recovery_probability} />
                    </TableCell>
                    <TableCell>
                      <Pill tone={toneForRisk(row.risk_level)}>{row.risk_level}</Pill>
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.recommended_action
                        ? (ACTION_LABELS[row.recommended_action as RecoveryAction] ?? humanize(row.recommended_action))
                        : "Not analysed"}
                    </TableCell>
                    <TableCell>
                      <Pill tone={toneForStatus(row.status)}>{humanize(row.status)}</Pill>
                    </TableCell>
                    <TableCell className="num text-xs text-muted-foreground">
                      {relativeTime(row.occurred_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/console/risk/$caseId" params={{ caseId: row.id }}>
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
