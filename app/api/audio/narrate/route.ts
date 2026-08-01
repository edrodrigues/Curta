import { NextRequest, NextResponse } from "next/server";
import {
  getRun,
  startNarrationRun,
  MonidError,
  type NarrationModel,
} from "@/lib/monid/client";
import { supabaseAdmin, AUDIO_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TEXT = 5000;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 60000;

const COST_PER_1000: Record<NarrationModel, number> = {
  eleven_multilingual_v2: 0.1,
  eleven_flash_v2_5: 0.05,
  eleven_v3: 0.1,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function recordRenderJob(payload: {
  project_id?: unknown;
  stage: "concluido" | "falhou";
  monid_run_id?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error_message?: string;
}) {
  if (typeof payload.project_id !== "string" || !payload.project_id) return;
  try {
    await supabaseAdmin().from("render_jobs").insert({
      project_id: payload.project_id,
      kind: "narracao",
      stage: payload.stage,
      monid_run_id: payload.monid_run_id ?? null,
      provider: "elevenlabs",
      endpoint: "/text-to-speech",
      input: payload.input,
      output: payload.output ?? null,
      error_message: payload.error_message ?? null,
    });
  } catch {
    /* auditoria não deve quebrar a narração */
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
  const data = (body ?? {}) as {
    project_id?: unknown;
    text?: unknown;
    voice_id?: unknown;
    model_id?: unknown;
    stability?: unknown;
    similarity_boost?: unknown;
    style?: unknown;
    speed?: unknown;
  };

  const projectId = typeof data.project_id === "string" ? data.project_id : undefined;
  const auditInput = {
    text_length: typeof data.text === "string" ? data.text.length : 0,
    voice_id: data.voice_id ?? null,
    model_id: data.model_id ?? "eleven_multilingual_v2",
    stability: data.stability ?? null,
    similarity_boost: data.similarity_boost ?? null,
    style: data.style ?? null,
    speed: data.speed ?? null,
  };

  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { ok: false, message: "Texto de narração vazio." },
      { status: 400 }
    );
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json(
      { ok: false, message: `Texto excede ${MAX_TEXT} caracteres. Reduza o roteiro.` },
      { status: 400 }
    );
  }
  const voice_id =
    typeof data.voice_id === "string" && data.voice_id.trim()
      ? data.voice_id.trim()
      : "";
  if (!voice_id) {
    return NextResponse.json(
      { ok: false, message: "voice_id ausente." },
      { status: 400 }
    );
  }
  const model_id =
    data.model_id === "eleven_flash_v2_5" ||
    data.model_id === "eleven_v3"
      ? data.model_id
      : "eleven_multilingual_v2";

  const num = (v: unknown) => (typeof v === "number" ? v : undefined);

  let runId: string;
  try {
    const started = await startNarrationRun({
      text,
      voice_id,
      model_id,
      stability: num(data.stability),
      similarity_boost: num(data.similarity_boost),
      style: num(data.style),
      speed: num(data.speed),
    });
    runId = started.run_id;
  } catch (e) {
    const err = e instanceof MonidError ? e : new MonidError((e as Error).message, "unknown");
    const status = err.kind === "auth" ? 503 : err.kind === "rate_limit" ? 429 : 502;
    await recordRenderJob({
      project_id: projectId,
      stage: "falhou",
      input: auditInput,
      error_message: err.message,
    });
    return NextResponse.json({ ok: false, message: err.message }, { status });
  }

  const deadline = Date.now() + POLL_MAX_MS;
  let status: string = "RUNNING";
  let download_url: string | undefined;
  try {
    while (Date.now() < deadline) {
      const res = await getRun(runId);
      status = res.status;
      if (status === "COMPLETED") {
        download_url = res.download_url;
        break;
      }
      if (status === "FAILED" || status === "BLOCKED" || status === "TIME_OUT" || status === "STOPPED") {
        const hint =
          status === "BLOCKED"
            ? "A Monid bloqueou a geração (limite/política). Ajuste os controles no painel da Monid antes de tentar novamente."
            : `Narração não foi concluída (${status}). ${res.error || ""}`;
        await recordRenderJob({
          project_id: projectId,
          stage: "falhou",
          monid_run_id: runId,
          input: auditInput,
          error_message: hint.trim(),
        });
        return NextResponse.json({ ok: false, message: hint.trim() }, { status: 502 });
      }
      await sleep(POLL_INTERVAL_MS);
    }
  } catch (e) {
    const err = e instanceof MonidError ? e : new MonidError((e as Error).message, "unknown");
    await recordRenderJob({
      project_id: projectId,
      stage: "falhou",
      monid_run_id: runId,
      input: auditInput,
      error_message: err.message,
    });
    return NextResponse.json(
      { ok: false, message: err.message, run_id: runId },
      { status: err.kind === "rate_limit" ? 429 : 502 }
    );
  }

  if (status !== "COMPLETED" || !download_url) {
    await recordRenderJob({
      project_id: projectId,
      stage: "falhou",
      monid_run_id: runId,
      input: auditInput,
      error_message: "timeout aguardando conclusão",
    });
    return NextResponse.json(
      {
        ok: false,
        message: "Narração demorou demais. O áudio não foi salvo; tente novamente.",
        run_id: runId,
      },
      { status: 504 }
    );
  }

  let audioBuffer: Buffer;
  try {
    const audioRes = await fetch(download_url, { cache: "no-store" });
    if (!audioRes.ok || !audioRes.body) {
      throw new Error(`Download do áudio falhou (HTTP ${audioRes.status}).`);
    }
    audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    if (audioBuffer.length === 0) {
      throw new Error("Áudio baixado veio vazio.");
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Não foi possível baixar o áudio: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  const narrationKey = `narration/${runId}.mp3`;
  const admin = supabaseAdmin();
  const { error: uploadErr } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(narrationKey, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json(
      { ok: false, message: `Upload do áudio ao Supabase falhou: ${uploadErr.message}` },
      { status: 502 }
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(narrationKey, 3600);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, message: "Upload OK, mas a URL assinada falhou." },
      { status: 502 }
    );
  }

  const estCostUsd = ((COST_PER_1000[model_id] ?? 0.1) * text.length) / 1000;

  await recordRenderJob({
    project_id: projectId,
    stage: "concluido",
    monid_run_id: runId,
    input: auditInput,
    output: {
      narration_key: narrationKey,
      character_count: text.length,
      est_cost_usd: Number(estCostUsd.toFixed(4)),
    },
  });

  return NextResponse.json({
    ok: true,
    run_id: runId,
    narration_key: narrationKey,
    narration_url: signed.signedUrl,
    character_count: text.length,
    est_cost_usd: Number(estCostUsd.toFixed(4)),
  });
}
