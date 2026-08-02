import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, copyFile, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { supabaseAdmin, VIDEO_BUCKET, AUDIO_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const execFileP = promisify(execFile);

const TRACK_BG_VOLUME = "0.25";

// A Vercel mata a invocação em `maxDuration` com FUNCTION_INVOCATION_TIMEOUT
// (504 + HTML, sem JSON). Trabalhamos dentro de um orçamento menor para sempre
// devolvermos um erro nosso, legível, antes de a plataforma cortar a conexão.
const BUDGET_MS = 54_000;
// Tempo reservado para ler o mp4 do /tmp, subir ao Storage e assinar a URL.
const UPLOAD_RESERVE_MS = 14_000;
// Teto absoluto do ffmpeg, mesmo que sobre orçamento.
const FFMPEG_MAX_MS = 35_000;
// TTL das URLs assinadas que o ffmpeg consome como entrada.
const INPUT_URL_TTL_SEC = 300;

function slug(s: string): string {
  return (
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "video"
  );
}

async function storageSignedUrl(bucket: string, key: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(key, INPUT_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Falha ao gerar URL assinada de ${bucket}/${key}: ${error?.message || "sem URL."}`
    );
  }
  return data.signedUrl;
}

async function readMusicFile(trackName: string): Promise<Buffer | null> {
  const filename = slug(trackName) + ".wav";
  try {
    return await readFile(join(process.cwd(), "public", "audio", filename));
  } catch {
    return null;
  }
}

// A cópia do binário (~80 MB) é memoizada no escopo do módulo: /tmp sobrevive
// enquanto a instância estiver quente, então isso custa uma vez por instância
// em vez de uma vez por requisição.
let ffmpegExecP: Promise<string> | null = null;

async function resolveFfmpeg(): Promise<string> {
  const bundled = ffmpegPath;
  if (!bundled) {
    throw new Error("Binário ffmpeg não encontrado no servidor.");
  }
  if (process.platform === "win32") return bundled;
  if (!ffmpegExecP) {
    ffmpegExecP = (async () => {
      // Binários rastreados pela output file tracing podem perder a permissão de
      // execução dentro da função serverless. Copia para /tmp e garante +x.
      const target = join(tmpdir(), "ffmpeg-curta-bin");
      try {
        const [src, cached] = await Promise.all([
          stat(bundled),
          stat(target).catch(() => null),
        ]);
        if (!cached || cached.size !== src.size) {
          const staging = `${target}.${process.pid}.tmp`;
          await copyFile(bundled, staging);
          await chmod(staging, 0o755);
          await rename(staging, target);
        } else {
          await chmod(target, 0o755);
        }
        return target;
      } catch {
        ffmpegExecP = null; // permite nova tentativa na próxima requisição
        return bundled;
      }
    })();
  }
  return ffmpegExecP;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

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
    video_key?: unknown;
    narration_key?: unknown;
    track_name?: unknown;
    project_id?: unknown;
  };

  const videoKey = typeof data.video_key === "string" ? data.video_key.trim() : "";
  const narrationKey =
    typeof data.narration_key === "string" ? data.narration_key.trim() : "";
  const projectId = typeof data.project_id === "string" ? data.project_id.trim() : "";
  const trackName = typeof data.track_name === "string" ? data.track_name.trim() : "";

  if (!videoKey || !/^final\//.test(videoKey)) {
    return NextResponse.json(
      { ok: false, message: "video_key inválido (esperado prefixo final/)." },
      { status: 400 }
    );
  }
  if (!narrationKey || !/^narration\//.test(narrationKey)) {
    return NextResponse.json(
      { ok: false, message: "narration_key inválido (esperado prefixo narration/)." },
      { status: 400 }
    );
  }
  if (!projectId) {
    return NextResponse.json({ ok: false, message: "project_id ausente." }, { status: 400 });
  }
  if (!ffmpegPath) {
    return NextResponse.json(
      { ok: false, message: "Binário ffmpeg não encontrado no servidor." },
      { status: 503 }
    );
  }

  const tmp = tmpdir();
  const base = `curta-mix-${projectId}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const trackPath = join(tmp, base + "-trilha.wav");
  const outPath = join(tmp, base + "-final.mp4");

  try {
    // O ffmpeg lê os inputs direto do Storage por URL assinada. Antes o vídeo
    // inteiro era baixado para um Buffer e regravado no /tmp antes de o ffmpeg
    // começar — uma cópia completa do arquivo em memória e em disco, em série,
    // dentro do mesmo orçamento de 60s.
    const [videoUrl, narrationUrl, ffmpegExec] = await Promise.all([
      storageSignedUrl(VIDEO_BUCKET, videoKey),
      storageSignedUrl(AUDIO_BUCKET, narrationKey),
      resolveFfmpeg(),
    ]);

    const musicBuf = trackName ? await readMusicFile(trackName) : null;
    if (musicBuf) await writeFile(trackPath, musicBuf);

    const httpIn = [
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
    ];

    const args = [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...httpIn,
      "-i",
      videoUrl,
      ...httpIn,
      "-i",
      narrationUrl,
    ];
    if (musicBuf) {
      args.push("-i", trackPath);
      args.push(
        "-filter_complex",
        `[1:a]volume=1.0[nar];[2:a]volume=${TRACK_BG_VOLUME}[bg];[nar][bg]amix=inputs=2:duration=first:dropout_transition=0[mix];[mix]apad[aout]`
      );
    } else {
      args.push("-filter_complex", "[1:a]apad[aout]");
    }
    args.push(
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      // `apad` produz silêncio infinito; `-shortest` fecha a saída no fim da
      // trilha de vídeo. Isso já funciona sozinho no build atual do
      // ffmpeg-static (verificado), mas em alguns builds o EOF não atravessa o
      // filter_complex e o encode de áudio segue indefinidamente. Os dois flags
      // abaixo são uma trava barata contra esse caso.
      "-shortest",
      "-fflags",
      "+shortest",
      "-max_interleave_delta",
      "100M",
      outPath
    );

    const ffmpegBudget = BUDGET_MS - elapsed() - UPLOAD_RESERVE_MS;
    if (ffmpegBudget <= 0) {
      throw new Error("Sem tempo hábil para montar o vídeo. Tente novamente.");
    }

    await execFileP(ffmpegExec, args, {
      timeout: Math.min(FFMPEG_MAX_MS, ffmpegBudget),
      killSignal: "SIGKILL",
      maxBuffer: 8 * 1024 * 1024,
    });

    const outBuf = await readFile(outPath);
    if (outBuf.length === 0) {
      throw new Error("Vídeo final gerado veio vazio.");
    }

    const finalKey = `final/${projectId}.mp4`;
    const admin = supabaseAdmin();
    const { error: upErr } = await admin.storage.from(VIDEO_BUCKET).upload(finalKey, outBuf, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (upErr) {
      throw new Error(`Upload do vídeo final falhou: ${upErr.message}`);
    }

    const { data: signed, error: signErr } = await admin.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(finalKey, 3600);
    if (signErr || !signed?.signedUrl) {
      throw new Error("Upload OK, mas a URL assinada falhou.");
    }

    return NextResponse.json({
      ok: true,
      video_url: signed.signedUrl,
      video_key: finalKey,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  } catch (e) {
    const err = e as Error & { stderr?: string | Buffer; killed?: boolean };
    let message = err?.message || "Falha ao montar o vídeo final.";
    if (err?.killed) {
      message =
        "A montagem do vídeo passou do tempo limite do servidor. Tente novamente; se repetir, reduza a duração ou a resolução do vídeo.";
    }
    if (err?.stderr) {
      const snippet = (Buffer.isBuffer(err.stderr) ? err.stderr.toString() : err.stderr)
        .trim()
        .split(/\r?\n/)
        .slice(-15)
        .join(" ");
      if (snippet) message = `${message} | ${snippet}`;
    }
    if (message.length > 4000) message = message.slice(0, 4000);
    console.error(`[video/mix] ${elapsed()}ms`, message);
    return NextResponse.json({ ok: false, message }, { status: 502 });
  } finally {
    for (const p of [trackPath, outPath]) {
      try {
        await unlink(p);
      } catch {
        /* best-effort */
      }
    }
  }
}
