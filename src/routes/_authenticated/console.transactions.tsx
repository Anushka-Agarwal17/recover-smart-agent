import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  Pill,
  formatDateTime,
  humanize,
  toneForStatus,
} from "@/components/console/primitives";
import { CaseDrawer } from "@/components/console/CaseDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_METHODS, formatCurrency } from "@/lib/recovery-engine";
import { listTransactions } from "@/lib/recoverai.functions";

const TITLE = "Payment Transactions — RecoverAI";
const DESCRIPTION =
  "Search and filter the full synthetic payment ledger, including failure reasons and recovery status per transaction.";

export const Route = createFileRoute("/_authenticated/console/transactions")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransactionsPage,
});

const PAGE_SIZE = 25;

function TransactionsPage() {
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [sort, setSort] = useState<"recent" | "amount">("recent");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  const params = { status, method, sort, search: search.trim() || undefined, page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: ["transactions", params],
    queryFn: () => listTransactions({ data: params }),
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every payment event the agent monitors, with its recovery state."
      />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="tx-search">Reference</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="tx-search"
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
            <Label htmlFor="tx-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger id="tx-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="ABANDONED">Abandoned</SelectItem>
                <SelectItem value="RECOVERED">Recovered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-method">Payment method</Label>
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v);
                setPage(1);
              }}
            >
              <SelectTrigger id="tx-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {humanize(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-sort">Sort</Label>
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as "recent" | "amount");
                setPage(1);
              }}
            >
              <SelectTrigger id="tx-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="amount">Highest amount</SelectItem>
              </SelectContent>
            </Select>
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
      {query.isLoading && <LoadingBlock rows={8} label="Loading transactions" />}
      {query.data?.rows.length === 0 && (
        <EmptyState title="No transactions found" description="Adjust the filters or rebuild the demo dataset." />
      )}

      {query.data && query.data.rows.length > 0 && (
        <Panel title={`${query.data.total.toLocaleString("en-US")} transactions`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Failure</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Recovery</TableHead>
                  <TableHead>Occurred</TableHead>
                  <TableHead className="text-right">Case</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={row.case_id ? () => setActiveCaseId(row.case_id) : undefined}
                    className={row.case_id ? "cursor-pointer" : undefined}
                    tabIndex={row.case_id ? 0 : undefined}
                    onKeyDown={
                      row.case_id
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveCaseId(row.case_id);
                            }
                          }
                        : undefined
                    }
                  >
                    <TableCell className="num text-xs">{row.transaction_ref}</TableCell>
                    <TableCell className="text-xs">{row.customer_name}</TableCell>
                    <TableCell className="num text-xs">{formatCurrency(row.amount, row.currency)}</TableCell>
                    <TableCell className="text-xs">{humanize(row.payment_method)}</TableCell>
                    <TableCell>
                      <Pill tone={toneForStatus(row.status)}>{humanize(row.status)}</Pill>
                    </TableCell>
                    <TableCell className="text-xs">{humanize(row.failure_reason)}</TableCell>
                    <TableCell className="num text-xs">{row.retry_count}</TableCell>
                    <TableCell className="text-xs">{humanize(row.recovery_status)}</TableCell>
                    <TableCell className="num text-xs text-muted-foreground">
                      {formatDateTime(row.occurred_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.case_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCaseId(row.case_id);
                          }}
                        >
                          Open
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

      <CaseDrawer caseId={activeCaseId} onClose={() => setActiveCaseId(null)} />
    </div>
  );
}
