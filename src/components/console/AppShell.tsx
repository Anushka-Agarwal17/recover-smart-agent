import { Link, useRouter } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { Pill } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/console", label: "Overview", icon: LayoutDashboard },
  { to: "/console/risk", label: "Revenue at Risk", icon: TriangleAlert },
  { to: "/console/queue", label: "Recovery Queue", icon: ListChecks },
  { to: "/console/agent", label: "AI Agent", icon: Bot },
  { to: "/console/transactions", label: "Transactions", icon: CreditCard },
  { to: "/console/customers", label: "Customers", icon: Users },
  { to: "/console/analytics", label: "Recovery Analytics", icon: BarChart3 },
  { to: "/console/audit", label: "Audit Trail", icon: ScrollText },
  { to: "/console/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === "/console" }}
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground"
        >
          <item.icon className="size-4 shrink-0" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="num text-xs text-muted-foreground">—</span>;
  return (
    <span className="num text-xs text-muted-foreground">
      {now.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

export function AppShell({
  merchantName,
  email,
  children,
}: {
  merchantName: string;
  email: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:flex lg:h-screen lg:flex-col lg:sticky lg:top-0">
        <div className="px-5 py-5">
          <Link to="/console" aria-label="RecoverAI overview">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border px-4 py-4">
          <p className="text-[0.7rem] text-muted-foreground">
            Simulation environment. Recovery outcomes are modelled on synthetic payment data.
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] bg-sidebar p-0">
              <SheetTitle className="px-5 py-5">
                <Logo />
              </SheetTitle>
              <div className="px-3">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{merchantName}</p>
            <p className="hidden text-[0.7rem] text-muted-foreground sm:block">Revenue recovery console</p>
          </div>

          <Pill tone="warning" className="hidden sm:inline-flex">
            <Activity className="size-3" aria-hidden /> DEMO / SYNTHETIC DATA
          </Pill>

          <Clock />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Recovery alerts appear in the audit trail</TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-full border border-border bg-secondary text-xs font-semibold"
            >
              {email.slice(0, 2).toUpperCase()}
            </span>
            <div className="hidden md:block">
              <p className="max-w-[160px] truncate text-xs font-medium">{email}</p>
              <button
                type="button"
                onClick={signOut}
                className="text-[0.7rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Sign out
              </button>
            </div>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={signOut} aria-label="Sign out">
              <LogOut className="size-4" aria-hidden />
            </Button>
          </div>
        </header>

        <main className={cn("flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8")}>{children}</main>
      </div>
    </div>
    </TooltipProvider>
  );
}
