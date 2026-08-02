import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { supabaseAdmin, VIDEO_BUCKET, AUDIO_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const execFileP = promisify(execFile);

const TRACK_BG_VOLUME = "0.25";

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

async function readStorageToBuffer(bucket: string, key: string): Promise<Buffer> {
  const admin = supabaseAdmin();
  const { data: signed, error: sErr } = await admin.storage.from(bucket).createSignedUrl(key, 120);
  if (sErr || !signed?.signedUrl) {
    throw new Error(`Falha ao gerar URL assinada de ${bucket}/${key}: ${sErr?.message || "sem URL."}`);
  }
  const res = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Falha ao baixar ${bucket}/${key}: HTTP ${res.status}.`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`Arquivo vazio: ${bucket}/${key}.`);
  return buf;
}

async function readMusicFile(trackName: string): Promise<Buffer | null> {
  const filename = slug(trackName) + ".wav";
  try {
    return await readFile(join(process.cwd(), "public", "audio", filename));
  } catch {
    return null;
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
  const videoPath = join(tmp, base + "-video.mp4");
  const narrationPath = join(tmp, base + "-narracao.mp3");
  const trackPath = join(tmp, base + "-trilha.wav");
  const outPath = join(tmp, base + "-final.mp4");

  try {
    const [videoBuf, narrationBuf] = await Promise.all([
      readStorageToBuffer(VIDEO_BUCKET, videoKey),
      readStorageToBuffer(AUDIO_BUCKET, narrationKey),
    ]);
    await Promise.all([
      writeFile(videoPath, videoBuf),
      writeFile(narrationPath, narrationBuf),
    ]);

    const musicBuf = trackName ? await readMusicFile(trackName) : null;
    if (musicBuf) await writeFile(trackPath, musicBuf);

    const args = [
      "-y",
      "-i",
      videoPath,
      "-i",
      narrationPath,
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
      "-shortest",
      outPath
    );

    await execFileP(ffmpegPath, args, { timeout: 100_000, maxBuffer: 64 * 1024 * 1024 });

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
    const message = (e as Error).message || "Falha ao montar o vídeo final.";
    console.error("[video/mix]", message);
    return NextResponse.json({ ok: false, message }, { status: 502 });
  } finally {
    for (const p of [videoPath, narrationPath, trackPath, outPath]) {
      try {
        await unlink(p);
      } catch {
        /* best-effort */
      }
    }
  }
}
