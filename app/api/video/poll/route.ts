import { NextRequest, NextResponse } from "next/server";
import { getRun, MonidError, type MonidRunStatus } from "@/lib/monid/client";
import { supabaseAdmin, VIDEO_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RunRef = { index: number; run_id: string };

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readRuns(v: unknown): RunRef[] {
  if (!Array.isArray(v)) return [];
  const out: RunRef[] = [];
  for (const row of v) {
    if (!isStringRecord(row)) continue;
    const index = typeof row.index === "number" ? row.index : -1;
    const run_id =
      typeof row.run_id === "string" ? row.run_id : typeof row.runId === "string" ? row.runId : "";
    if (index >= 0 && run_id) out.push({ index, run_id });
  }
  return out;
}

function mapStatus(s: MonidRunStatus): "pendente" | "rodando" | "concluido" | "falhou" {
  switch (s) {
    case "READY":
    case "RUNNING":
      return "rodando";
    case "COMPLETED":
      return "concluido";
    case "FAILED":
    case "BLOCKED":
    case "TIME_OUT":
    case "STOPPED":
      return "falhou";
    default:
      return "rodando";
  }
}

async function uploadClip(
  run_id: string,
  download_url: string
): Promise<{ key: string | null; error?: string }> {
  try {
    const res = await fetch(download_url, { cache: "no-store" });
    if (!res.ok || !res.body) {
      return { key: null, error: `Download do clipe falhou (HTTP ${res.status}).` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      return { key: null, error: "Clipe baixado veio vazio." };
    }
    const key = `clips/${run_id}.mp4`;
    const admin = supabaseAdmin();
    const { error } = await admin.storage
      .from(VIDEO_BUCKET)
      .upload(key, buf, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (error) {
      console.error(`[video/poll] upload falhou para run ${run_id}:`, error.message);
      return { key: null, error: `Upload ao Supabase falhou: ${error.message}` };
    }
    return { key };
  } catch (e) {
    const message = (e as Error).message || "Erro desconhecido.";
    console.error(`[video/poll] uploadClip falhou para run ${run_id}:`, message);
    return { key: null, error: message };
  }
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
  const data = (body ?? {}) as { runs?: unknown };
  const runs = readRuns(data.runs);
  if (runs.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Nenhum run_id fornecido para consulta." },
      { status: 400 }
    );
  }

  const jobs = await Promise.all(
    runs.map(async (r) => {
      try {
        const res = await getRun(r.run_id);
        const status = mapStatus(res.status);
        let clip_url: string | undefined = undefined;
        if (status === "concluido" && res.download_url) {
          const saved = await uploadClip(r.run_id, res.download_url);
          if (saved.key) clip_url = saved.key;
          else {
            return {
              index: r.index,
              run_id: r.run_id,
              status: "falhou" as const,
              error: saved.error || "Não foi possível baixar e armazenar o clipe gerado.",
            };
          }
        }
        if (status === "falhou") {
          return {
            index: r.index,
            run_id: r.run_id,
            status,
            clip_url,
            error: res.error || `Monid: ${res.status}`,
          };
        }
        return { index: r.index, run_id: r.run_id, status, clip_url };
      } catch (e) {
        const err =
          e instanceof MonidError
            ? e
            : new MonidError((e as Error).message, "unknown");
        return {
          index: r.index,
          run_id: r.run_id,
          status: "falhou" as const,
          error: err.message,
        };
      }
    })
  );

  return NextResponse.json({ ok: true, jobs });
}