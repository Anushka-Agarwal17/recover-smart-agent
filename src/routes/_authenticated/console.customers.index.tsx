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
  toneForRisk,
} from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/recovery-engine";
import { listCustomers } from "@/lib/recoverai.functions";

const TITLE = "Customers — RecoverAI";
const DESCRIPTION =
  "Customer payment reliability: lifetime value, prior successes and failures, and recovery risk level.";

export const Route = createFileRoute("/_authenticated/console/customers/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomersPage,
});

const PAGE_SIZE = 25;

function CustomersPage() {
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("all");
  const [page, setPage] = useState(1);

  const params = { search: search.trim() || undefined, risk, page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: ["customers", params],
    queryFn: () => listCustomers({ data: params }),
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Payment history drives recovery probability — reliable payers recover far more often."
      />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cust-search">Name or customer ID</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="cust-search"
                className="pl-9"
                placeholder="Search customers"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-risk">Risk level</Label>
            <Select
              value={risk}
              onValueChange={(v) => {
                setRisk(v);
                setPage(1);
              }}
            >
              <SelectTrigger id="cust-risk">
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
        </div>
      </Panel>

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.isLoading && <LoadingBlock rows={8} label="Loading customers" />}
      {query.data?.rows.length === 0 && (
        <EmptyState title="No customers found" description="Adjust the filters or rebuild the demo dataset." />
      )}

      {query.data && query.data.rows.length > 0 && (
        <Panel title={`${query.data.total.toLocaleString("en-US")} customers`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Lifetime value</TableHead>
                  <TableHead>Successes</TableHead>
                  <TableHead>Failures</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right">History</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">
                      <span className="block">{row.name}</span>
                      <span className="text-[0.65rem] text-muted-foreground">{row.email}</span>
                    </TableCell>
                    <TableCell className="num text-xs">{row.external_id}</TableCell>
                    <TableCell className="num text-xs">{formatCurrency(row.lifetime_value)}</TableCell>
                    <TableCell className="num text-xs">{row.previous_success_count}</TableCell>
                    <TableCell className="num text-xs">{row.previous_failure_count}</TableCell>
                    <TableCell className="num text-xs">{row.total_transactions}</TableCell>
                    <TableCell>
                      <Pill tone={toneForRisk(row.risk_level)}>{row.risk_level}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/console/customers/$customerId" params={{ customerId: row.id }}>
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
