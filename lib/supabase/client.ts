import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_URL = "https://olnrqblgsyyxmtubdoez.supabase.co";

export function createSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) ausente. Defina-a em .env.local."
    );
  }
  return createBrowserClient(url, key);
}