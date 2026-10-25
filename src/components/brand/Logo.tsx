import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="relative grid size-8 place-items-center rounded-lg border border-primary/40 bg-primary/10"
      >
        <span className="absolute inset-1.5 rounded-[5px] border border-primary/50" />
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
      {!compact && (
        <span className="font-display text-[1.05rem] font-semibold tracking-tight">
          Recover<span className="text-primary">AI</span>
        </span>
      )}
    </span>
  );
}
