import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

ffmpeg.setFfmpegPath(ffmpegPath.path);

const CLIPS_DIR = path.join(process.cwd(), "public", "_clips");
const FINAL_DIR = path.join(process.cwd(), "public", "_final");

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readClipUrls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const row of v) {
    if (Array.isArray(row)) {
      for (const sub of row) {
        if (typeof sub === "string") out.push(sub);
        else if (isStringRecord(sub) && typeof sub.clip_url === "string") out.push(sub.clip_url);
      }
    } else if (typeof row === "string") {
      out.push(row);
    } else if (isStringRecord(row) && typeof row.clip_url === "string") {
      out.push(row.clip_url);
    }
  }
  return out;
}

function clipAbsFromUrl(url: string): string {
  const rel = url.startsWith("/_clips/") ? url.slice("/_clips/".length) : path.basename(url);
  return path.join(CLIPS_DIR, rel);
}

async function concatWithCopy(
  absClips: string[],
  listFile: string,
  outFile: string
): Promise<void> {
  const list = absClips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n");
  await fs.promises.writeFile(listFile, list, "utf8");
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(outFile);
  });
}

async function concatWithReencode(
  absClips: string[],
  outFile: string
): Promise<void> {
  const cmd = ffmpeg();
  for (const c of absClips) cmd.input(c);
  await new Promise<void>((resolve, reject) => {
    cmd
      .outputOptions([
        "-filter_complex",
        `${absClips.map((_, i) => `[${i}:v:0]`).join("")}concat=n=${absClips.length}:v=1:a=0[v]`,
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
      ])
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(outFile);
  });
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
  const data = (body ?? {}) as { clip_urls?: unknown; project_id?: unknown };
  const clipUrls = readClipUrls(data.clip_urls);

  if (clipUrls.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Nenhum clipe fornecido para a montagem." },
      { status: 400 }
    );
  }

  const absClips = clipUrls.map(clipAbsFromUrl);
  const missing = absClips.filter((c) => !fs.existsSync(c));
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, message: "Um ou mais clipes não foram encontrados em disco." },
      { status: 422 }
    );
  }

  await fs.promises.mkdir(FINAL_DIR, { recursive: true }).catch(() => {});
  const token =
    (typeof data.project_id === "string" && data.project_id) ||
    Date.now().toString(16) + Math.random().toString(16).slice(2);
  const outFile = path.join(FINAL_DIR, `${token}.mp4`);
  const listFile = path.join(FINAL_DIR, `${token}-list.txt`);

  try {
    try {
      await concatWithCopy(absClips, listFile, outFile);
    } catch {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
      await concatWithReencode(absClips, outFile);
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Falha na montagem ffmpeg: ${(e as Error).message}` },
      { status: 500 }
    );
  } finally {
    try {
      if (fs.existsSync(listFile)) await fs.promises.unlink(listFile);
    } catch {
      /* noop */
    }
  }

  const stat = fs.existsSync(outFile) ? fs.statSync(outFile) : null;
  if (!stat || stat.size === 0) {
    return NextResponse.json(
      { ok: false, message: "A montagem não produziu um arquivo." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    video_url: `/_final/${token}.mp4`,
    size_bytes: stat.size,
  });
}