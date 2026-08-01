import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_URL = "https://olnrqblgsyyxmtubdoez.supabase.co";

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente. Defina-a em .env.local (server-only)."
    );
  }
  if (key.length < 40) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY parece inválida (valor muito curto). Copie a service role key (ou secret key) em Project Settings > API no painel do Supabase."
    );
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export const VIDEO_BUCKET = "video";