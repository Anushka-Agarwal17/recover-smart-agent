import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/console/AppShell";
import { ErrorState, LoadingBlock } from "@/components/console/primitives";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspace } from "@/lib/recoverai.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const workspace = useQuery({
    queryKey: ["workspace"],
    queryFn: () => getWorkspace(),
    staleTime: 60_000,
  });

  if (workspace.isError) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24">
        <ErrorState
          message={workspace.error instanceof Error ? workspace.error.message : undefined}
          onRetry={() => void workspace.refetch()}
          retrying={workspace.isFetching}
        />
      </div>
    );
  }

  return (
    <AppShell merchantName={workspace.data?.merchantName ?? "Loading workspace…"} email={email}>
      {workspace.isLoading ? <LoadingBlock rows={5} label="Preparing your workspace" /> : <Outlet />}
    </AppShell>
  );
}
