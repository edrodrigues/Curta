import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, AUDIO_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_TTL_SEC = 3600;
const ALLOWED_PREFIXES = ["narration/"];

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Corpo da requisição inválido." },
      { status: 400 }
    );
  }
  const key =
    typeof body === "object" &&
    body !== null &&
    "key" in body &&
    typeof (body as { key: unknown }).key === "string"
      ? (body as { key: string }).key.trim()
      : "";

  if (!key || key.includes("..") || key.startsWith("/")) {
    return NextResponse.json(
      { ok: false, message: "Chave de objeto inválida." },
      { status: 400 }
    );
  }
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return NextResponse.json(
      { ok: false, message: "Prefixo de objeto não permitido." },
      { status: 400 }
    );
  }

  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(key, SIGNED_TTL_SEC);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, message: error?.message || "Falha ao assinar URL." },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      url: data.signedUrl,
      expires_at: new Date(Date.now() + SIGNED_TTL_SEC * 1000).toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error).message || "Erro ao assinar URL." },
      { status: 500 }
    );
  }
}
