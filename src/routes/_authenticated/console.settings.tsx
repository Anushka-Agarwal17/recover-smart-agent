import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  Pill,
} from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/recovery-engine";
import { getSettings, resetDemoData, saveSettings } from "@/lib/recoverai.functions";

const TITLE = "Recovery Policy & Guardrails — RecoverAI";
const DESCRIPTION =
  "Configure retry limits, recovery windows, probability thresholds and escalation rules that bound the AI agent.";

export const Route = createFileRoute("/_authenticated/console/settings")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

interface FormState {
  max_retries: number;
  recovery_window_hours: number;
  min_recovery_probability: number;
  max_interventions: number;
  escalation_threshold_amount: number;
}

const FIELDS: Array<{
  key: keyof FormState;
  label: string;
  hint: string;
  min: number;
  max: number;
  step?: number;
}> = [
  {
    key: "max_retries",
    label: "Max smart retries per case",
    hint: "Network-level retries are capped to avoid issuer penalties (0–2).",
    min: 0,
    max: 2,
  },
  {
    key: "recovery_window_hours",
    label: "Recovery window (hours)",
    hint: "After this window a case is closed as unrecoverable (1–720).",
    min: 1,
    max: 720,
  },
  {
    key: "min_recovery_probability",
    label: "Minimum recovery probability (%)",
    hint: "Cases below this modelled probability are never actioned (10–90).",
    min: 10,
    max: 90,
  },
  {
    key: "max_interventions",
    label: "Max interventions per case",
    hint: "Total actions of any type allowed on one case (1–6).",
    min: 1,
    max: 6,
  },
  {
    key: "escalation_threshold_amount",
    label: "Escalation threshold (USD)",
    hint: "Cases above this value are escalated to a human instead of auto-actioned (50–100,000).",
    min: 50,
    max: 100000,
    step: 50,
  },
];

function SettingsPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: () => getSettings() });
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setForm({
      max_retries: query.data.max_retries,
      recovery_window_hours: query.data.recovery_window_hours,
      min_recovery_probability: query.data.min_recovery_probability,
      max_interventions: query.data.max_interventions,
      escalation_threshold_amount: Number(query.data.escalation_threshold_amount),
    });
  }, [query.data]);

  const save = useMutation({
    mutationFn: (values: FormState) => saveSettings({ data: values }),
    onSuccess: async () => {
      toast.success("Recovery policy updated.");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the recovery policy."),
  });

  const reset = useMutation({
    mutationFn: () => resetDemoData(),
    onSuccess: async (result) => {
      toast.success(
        `Simulation reset: ${result.transactions} transactions and ${result.customers} customers regenerated.`,
      );
      await qc.invalidateQueries();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not regenerate the simulation."),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recovery policy"
        description="These guardrails are enforced server-side. The AI agent may recommend anything; only policy-compliant actions execute."
        actions={<Pill tone="info">Simulation environment</Pill>}
      />

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.isLoading && <LoadingBlock rows={5} label="Loading policy" />}

      {form && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(form);
          }}
        >
          <Panel
            title="Guardrails"
            description="Applied to every diagnosis, decision and intervention"
            action={
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                Save policy
              </Button>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type="number"
                    inputMode="numeric"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    value={form[field.key]}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, [field.key]: Number(event.target.value) } : current,
                      )
                    }
                    className="num"
                  />
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-border p-4 text-xs text-muted-foreground">
              Current policy in plain language: retry a failed payment at most{" "}
              <span className="text-foreground">{form.max_retries}</span> times within{" "}
              <span className="text-foreground">{form.recovery_window_hours}h</span>, never act when modelled
              recovery probability is under{" "}
              <span className="text-foreground">{form.min_recovery_probability}%</span>, stop after{" "}
              <span className="text-foreground">{form.max_interventions}</span> interventions, and escalate
              anything above{" "}
              <span className="text-foreground">{formatCurrency(form.escalation_threshold_amount)}</span> to a
              human reviewer. Customers who opted out are never contacted.
            </div>
          </Panel>
        </form>
      )}

      <Panel
        title="Simulation data"
        description="Regenerate the synthetic merchant dataset — customers, transactions, cases and history"
        action={
          <Button variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}>
            {reset.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )}
            Reset demo data
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground">
          RecoverAI never touches a real payment processor. Retries, reminders and escalations are simulated
          with deterministic outcomes so results are reproducible. Resetting clears all current cases,
          decisions, attempts and audit events for your workspace.
        </p>
      </Panel>
    </div>
  );
}
