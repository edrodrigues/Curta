import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FN_URL =
  "https://olnrqblgsyyxmtubdoez.functions.supabase.co/assemble-video";

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readClipPaths(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const row of v) {
    if (Array.isArray(row)) {
      for (const sub of row) {
        if (typeof sub === "string") out.push(sub);
        else if (isStringRecord(sub) && typeof sub.clip_url === "string")
          out.push(sub.clip_url);
        else if (isStringRecord(sub) && typeof sub.clip_path === "string")
          out.push(sub.clip_path);
      }
    } else if (typeof row === "string") {
      out.push(row);
    } else if (isStringRecord(row) && typeof row.clip_url === "string") {
      out.push(row.clip_url);
    } else if (isStringRecord(row) && typeof row.clip_path === "string") {
      out.push(row.clip_path);
    }
  }
  return out;
}

function randomToken(): string {
  return (
    "f" + Date.now().toString(16) + Math.random().toString(16).slice(2)
  );
}

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
  const data = (body ?? {}) as {
    clip_urls?: unknown;
    clip_paths?: unknown;
    project_id?: unknown;
  };
  const clip_paths = readClipPaths(data.clip_paths ?? data.clip_urls);

  if (clip_paths.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Nenhum clipe fornecido para a montagem." },
      { status: 400 }
    );
  }

  const project_id =
    (typeof data.project_id === "string" && data.project_id) || randomToken();

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey.length < 40) {
    return NextResponse.json(
      {
        ok: false,
        message: !serviceKey
          ? "SUPABASE_SERVICE_ROLE_KEY ausente."
          : "SUPABASE_SERVICE_ROLE_KEY parece inválida (valor muito curto). Copie a service role key (ou secret key) em Project Settings > API no painel do Supabase.",
      },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ clip_paths, project_id }),
      cache: "no-store",
    });
    const dataFn = await res.json().catch(() => null);
    if (!res.ok || !dataFn || !dataFn.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: dataFn?.message || "Falha na montagem remota.",
        },
        { status: res.status || 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      video_url: dataFn.video_url,
      expires_at: dataFn.expires_at,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Erro de conexão à Edge Function: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}