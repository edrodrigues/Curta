import { NextRequest, NextResponse } from "next/server";
import {
  getRun,
  startNarrationRun,
  releaseRunResources,
  MonidError,
  type MonidRunStatus,
  type NarrationModel,
} from "@/lib/monid/client";
import { supabaseAdmin, AUDIO_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 5000;

const COST_PER_1000: Record<NarrationModel, number> = {
  eleven_multilingual_v2: 0.1,
  eleven_flash_v2_5: 0.05,
  eleven_v3: 0.1,
};

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function httpStatusFor(err: MonidError): number {
  if (err.kind === "auth") return 503;
  if (err.kind === "rate_limit") return 429;
  return 502;
}

function asMonidError(e: unknown): MonidError {
  return e instanceof MonidError ? e : new MonidError((e as Error).message, "unknown");
}

type AudioSource =
  | { kind: "base64"; base64: string; contentType?: string }
  | { kind: "url"; url: string; contentType?: string };

function firstUrl(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  for (const key of ["download_link", "download_url", "url"]) {
    const x = o[key];
    if (typeof x === "string" && x.length > 0) return x;
  }
  return undefined;
}

function audioSourceFromOutput(output: unknown): AudioSource | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  const contentType = typeof o.content_type === "string" ? o.content_type : undefined;
  for (const key of ["audio_base64", "audio_b64", "base64"]) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0) {
      return { kind: "base64", base64: v, contentType };
    }
  }
  const audio = o.audio;
  if (typeof audio === "string" && audio.length > 0) {
    if (audio.startsWith("http://") || audio.startsWith("https://")) {
      return { kind: "url", url: audio, contentType };
    }
    return { kind: "base64", base64: audio, contentType };
  }
  const nested = firstUrl(audio);
  if (nested) return { kind: "url", url: nested, contentType };
  const root = firstUrl(o);
  if (root) return { kind: "url", url: root, contentType };
  return null;
}

async function updateRenderJob(
  run_id: string,
  patch: {
    stage: "em_andamento" | "concluido" | "falhou";
    output?: Record<string, unknown>;
    error_message?: string;
  }
) {
  try {
    await supabaseAdmin()
      .from("render_jobs")
      .update({
        stage: patch.stage,
        output: patch.output ?? null,
        error_message: patch.error_message ?? null,
      })
      .eq("kind", "narracao")
      .eq("monid_run_id", run_id);
  } catch {
    /* auditoria não deve quebrar a narração */
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Corpo da requisição inválido.", 400);
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
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) return fail("Texto de narração vazio.", 400);
  if (text.length > MAX_TEXT) {
    return fail(`Texto excede ${MAX_TEXT} caracteres. Reduza o roteiro.`, 400);
  }
  const voice_id =
    typeof data.voice_id === "string" && data.voice_id.trim()
      ? data.voice_id.trim()
      : "";
  if (!voice_id) return fail("voice_id ausente.", 400);
  const model_id =
    data.model_id === "eleven_flash_v2_5" || data.model_id === "eleven_v3"
      ? data.model_id
      : "eleven_multilingual_v2";

  const num = (v: unknown) => (typeof v === "number" ? v : undefined);

  let started;
  try {
    started = await startNarrationRun({
      text,
      voice_id,
      model_id,
      stability: num(data.stability),
      similarity_boost: num(data.similarity_boost),
      style: num(data.style),
      speed: num(data.speed),
    });
  } catch (e) {
    const err = asMonidError(e);
    return fail(err.message, httpStatusFor(err));
  }

  const estCostUsd = ((COST_PER_1000[model_id] ?? 0.1) * text.length) / 1000;
  if (typeof projectId === "string" && projectId) {
    try {
      await supabaseAdmin().from("render_jobs").insert({
        project_id: projectId,
        kind: "narracao",
        stage: "em_andamento",
        monid_run_id: started.run_id,
        provider: "elevenlabs",
        endpoint: "/text-to-speech",
        input: {
          text_length: text.length,
          voice_id,
          model_id,
          stability: num(data.stability) ?? null,
          similarity_boost: num(data.similarity_boost) ?? null,
          style: num(data.style) ?? null,
          speed: num(data.speed) ?? null,
          est_cost_usd: Number(estCostUsd.toFixed(4)),
        },
      });
    } catch {
      /* auditoria não deve quebrar a narração */
    }
  }

  return NextResponse.json({ ok: true, run_id: started.run_id, status: started.status });
}

export async function GET(req: NextRequest) {
  const run_id = req.nextUrl.searchParams.get("run_id")?.trim() || "";
  if (!run_id) return fail("run_id ausente.", 400);

  const admin = supabaseAdmin();
  const { data: job } = await admin
    .from("render_jobs")
    .select("stage, monid_run_id, output, input")
    .eq("kind", "narracao")
    .eq("monid_run_id", run_id)
    .maybeSingle();

  const storedOutput =
    job && job.stage === "concluido" && typeof job.output === "object" && job.output !== null
      ? (job.output as Record<string, unknown>)
      : null;
  if (storedOutput && typeof storedOutput.narration_key === "string") {
    const { data: signed, error: signErr } = await admin.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(storedOutput.narration_key, 3600);
    if (!signErr && signed?.signedUrl) {
      return NextResponse.json({
        ok: true,
        run_id,
        status: "COMPLETED",
        narration_key: storedOutput.narration_key,
        narration_url: signed.signedUrl,
        character_count: storedOutput.character_count ?? null,
        est_cost_usd: storedOutput.est_cost_usd ?? null,
      });
    }
  }

  let run;
  try {
    run = await getRun(run_id);
  } catch (e) {
    const err = asMonidError(e);
    return fail(err.message, httpStatusFor(err), { run_id });
  }

  const terminal: MonidRunStatus[] = ["FAILED", "BLOCKED", "TIME_OUT", "STOPPED"];
  if (terminal.includes(run.status)) {
    const hint =
      run.status === "BLOCKED"
        ? "A Monid bloqueou a geração (limite/política). Ajuste os controles no painel da Monid antes de tentar novamente."
        : `Narração não foi concluída (${run.status}). ${run.error || ""}`;
    await updateRenderJob(run_id, { stage: "falhou", error_message: hint.trim() });
    return fail(hint.trim(), 502, { run_id });
  }

  if (run.status !== "COMPLETED") {
    return NextResponse.json({ ok: true, run_id, status: run.status });
  }

  let audioBuffer: Buffer;
  let audioContentType = "audio/mpeg";
  const source = audioSourceFromOutput(run.output);
  const download = async (url: string) => {
    const audioRes = await fetch(url, { cache: "no-store" });
    if (!audioRes.ok || !audioRes.body) {
      throw new Error(`Download do áudio falhou (HTTP ${audioRes.status}).`);
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    if (buf.length === 0) throw new Error("Áudio baixado veio vazio.");
    return buf;
  };
  if (run.download_url) {
    try {
      audioBuffer = await download(run.download_url);
    } catch (e) {
      return fail(`Não foi possível baixar o áudio: ${(e as Error).message}`, 502, { run_id });
    }
  } else if (source?.kind === "url") {
    try {
      audioBuffer = await download(source.url);
      if (source.contentType) audioContentType = source.contentType;
    } catch (e) {
      return fail(`Não foi possível baixar o áudio: ${(e as Error).message}`, 502, { run_id });
    }
  } else if (source?.kind === "base64") {
    try {
      audioBuffer = Buffer.from(source.base64, "base64");
      if (audioBuffer.length === 0) throw new Error("Áudio base64 veio vazio.");
      if (source.contentType) audioContentType = source.contentType;
    } catch (e) {
      return fail(`Não foi possível decodificar o áudio: ${(e as Error).message}`, 502, { run_id });
    }
  } else {
    return fail("Run concluído sem áudio (sem download_url, URL ou base64 no output).", 502, { run_id });
  }

  const narrationKey = `narration/${run_id}.mp3`;
  const { error: uploadErr } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(narrationKey, audioBuffer, { contentType: audioContentType, upsert: true });
  if (uploadErr) {
    return fail(`Upload do áudio ao Supabase falhou: ${uploadErr.message}`, 502, { run_id });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(narrationKey, 3600);
  if (signErr || !signed?.signedUrl) {
    return fail("Upload OK, mas a URL assinada falhou.", 502, { run_id });
  }

  const charCount =
    typeof run.input === "object" && run.input && typeof (run.input as { body?: { text?: unknown } }).body?.text === "string"
      ? ((run.input as { body: { text: string } }).body.text.length)
      : storedOutput?.character_count
        ? Number(storedOutput.character_count)
        : 0;
  const estCostUsd = Number((((COST_PER_1000[(run.input as { body?: { model_id?: NarrationModel } }).body?.model_id as NarrationModel] ?? 0.1) * charCount) / 1000).toFixed(4));

  await updateRenderJob(run_id, {
    stage: "concluido",
    output: { narration_key: narrationKey, character_count: charCount, est_cost_usd: estCostUsd },
  });

  if (run.resource_ids && run.resource_ids.length > 0) {
    try {
      await releaseRunResources(run.resource_ids);
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({
    ok: true,
    run_id,
    status: "COMPLETED",
    narration_key: narrationKey,
    narration_url: signed.signedUrl,
    character_count: charCount,
    est_cost_usd: estCostUsd,
  });
}
