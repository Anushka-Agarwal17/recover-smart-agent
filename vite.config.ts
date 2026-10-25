// @lovable.dev/vite-tanstack-config already includes the following ΓÇö do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are read from .env.local at dev time
    // and from the hosting environment at build/production time.
    // Do NOT hard-code keys here.
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
