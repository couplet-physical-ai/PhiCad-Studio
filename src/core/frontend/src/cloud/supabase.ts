import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readCloudConfig } from "./config";
import { createCloudStorage } from "./secure-storage-adapter";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = readCloudConfig();
  if (!cfg.enabled) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      // PKCE: required for Electron deep-link OAuth return path.
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: createCloudStorage(),
      storageKey: "openpcb.auth",
    },
  });
  // DEV-ONLY: expose the client so a local tester can sign in from the devtools
  // console (e.g. `await __openpcbSupabase.auth.signInWithPassword({...})`) when the
  // browser-handoff/deep-link flow is unavailable (macOS dev). Stripped in prod builds.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (
      window as unknown as { __openpcbSupabase?: SupabaseClient }
    ).__openpcbSupabase = client;
  }
  return client;
}
