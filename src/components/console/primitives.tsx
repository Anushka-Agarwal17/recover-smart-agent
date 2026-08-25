import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/recovery-engine";

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string | undefined;
  description?: string | undefined;
  action?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("panel p-5", className)}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function LoadingBlock({ rows = 4, label = "Loading data" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
  retrying?: boolean | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="size-6 text-destructive" aria-hidden />
      <div>
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {message ?? "We couldn't load this data. Please try again."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Retry
        </Button>
      )}
    </div>
  );
}

const TONES = {
  success: "border-success/35 bg-success/12 text-success",
  danger: "border-destructive/35 bg-destructive/12 text-destructive",
  warning: "border-warning/35 bg-warning/12 text-warning",
  info: "border-info/35 bg-info/12 text-info",
  neutral: "border-border bg-secondary text-muted-foreground",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function toneForStatus(status: string): Tone {
  switch (status.toUpperCase()) {
    case "SUCCESS":
    case "RECOVERED":
      return "success";
    case "FAILED":
      return "danger";
    case "ABANDONED":
    case "PENDING":
    case "STOPPED":
      return "warning";
    case "IN_PROGRESS":
    case "OPEN":
      return "info";
    case "ESCALATED":
      return "warning";
    default:
      return "neutral";
  }
}

export function toneForRisk(risk: string): Tone {
  return risk === "high" ? "danger" : risk === "medium" ? "warning" : "success";
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function KpiCard({
  label,
  value,
  format,
  hint,
  delta,
}: {
  label: string;
  value: number;
  format: "currency" | "percent" | "count";
  hint: string;
  delta: number | null;
}) {
  const display =
    format === "currency"
      ? formatCurrency(value)
      : format === "percent"
        ? `${value.toFixed(1)}%`
        : value.toLocaleString("en-US");
  const positive = (delta ?? 0) >= 0;

  return (
    <div className="panel animate-in fade-in slide-in-from-bottom-1 p-4 duration-500">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{display}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta != null && (
          <Pill tone={positive ? "success" : "danger"}>
            {positive ? "+" : ""}
            {delta.toFixed(1)}% vs prev 14d
          </Pill>
        )}
        <span className="text-[0.7rem] leading-tight text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

export function ProbabilityBar({ value }: { value: number }) {
  const tone = value >= 65 ? "bg-success" : value >= 40 ? "bg-warning" : "bg-destructive";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full transition-all", tone)} style={{ width: `${value}%` }} />
      </span>
      <span className="num text-xs">{value}%</span>
    </span>
  );
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const hours = diff / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
