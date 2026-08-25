import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditEvents } from "@/lib/recoverai.functions";

const TITLE = "Audit Trail — RecoverAI";
const DESCRIPTION =
  "Append-only log of every detection, diagnosis, decision, intervention and guardrail block in the recovery workflow.";

export const Route = createFileRoute("/_authenticated/console/audit")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPage,
});

const EVENT_TYPES = [
  "all",
  "case_detected",
  "case_analyzed",
  "action_executed",
  "action_blocked",
  "case_escalated",
  "demo_data_reset",
  "settings_updated",
];

const PAGE_SIZE = 30;

function AuditPage() {
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["audit", type, search, page],
    queryFn: () =>
      listAuditEvents({ data: { page, pageSize: PAGE_SIZE, type, search: search || undefined } }),
  });

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description="Immutable record of what the agent saw, decided and did — including everything policy blocked."
      />

      <Panel
        title="System events"
        description={`${total.toLocaleString()} events recorded`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search payment reference"
              className="h-9 w-56"
              aria-label="Search audit events by payment reference"
            />
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-48" aria-label="Filter by event type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All event types" : humanize(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {query.isError && (
          <ErrorState
            message={query.error instanceof Error ? query.error.message : undefined}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
        {query.isLoading && <LoadingBlock rows={8} label="Loading audit trail" />}
        {query.data && query.data.rows.length === 0 && (
          <EmptyState
            title="No events match"
            description="Adjust the filters, or run the agent to generate new audit entries."
          />
        )}

        {query.data && query.data.rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.rows.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="num whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(event.created_at)}
                      </TableCell>
                      <TableCell>
                        <Pill tone={toneForStatus(event.event_type)}>{humanize(event.event_type)}</Pill>
                      </TableCell>
                      <TableCell className="text-xs">{humanize(event.actor)}</TableCell>
                      <TableCell className="num text-xs">{event.transaction_ref ?? "—"}</TableCell>
                      <TableCell className="text-xs">{humanize(event.action) || "—"}</TableCell>
                      <TableCell className="text-xs">{humanize(event.result) || "—"}</TableCell>
                      <TableCell className="max-w-[22rem] text-xs text-muted-foreground">
                        {event.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="num">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() => setPage((current) => Math.min(pages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
