import { NextRequest, NextResponse } from "next/server";
import { startVideoRun, MonidError } from "@/lib/monid/client";
import type { VideoDuration, VideoResolution } from "@/lib/monid/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CENAS = 12;

type CenaInput = { prompt_en: string; duration_hint: number };

const COST_BY_DURATION: Record<number, number> = { 6: 0.28, 10: 0.56 };

function readCenas(v: unknown): CenaInput[] {
  if (!Array.isArray(v)) return [];
  const out: CenaInput[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const prompt = typeof o.prompt_en === "string" ? o.prompt_en.trim() : "";
    if (!prompt) continue;
    const rawDur = typeof o.duration_hint === "number" ? o.duration_hint : 6;
    const duration = rawDur === 10 ? 10 : 6;
    out.push({ prompt_en: prompt, duration_hint: duration });
  }
  return out;
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
  const data = (body ?? {}) as { cenas?: unknown; resolution?: unknown };
  const cenas = readCenas(data.cenas);

  if (cenas.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Nenhuma cena com prompt válido fornecida." },
      { status: 400 }
    );
  }
  if (cenas.length > MAX_CENAS) {
    return NextResponse.json(
      { ok: false, message: `Máximo de ${MAX_CENAS} cenas por vídeo.` },
      { status: 400 }
    );
  }
  const resolution: VideoResolution =
    data.resolution === "1080P" ? "1080P" : "768P";

  const estCost = cenas.reduce(
    (sum, c) => sum + (COST_BY_DURATION[c.duration_hint] ?? COST_BY_DURATION[6]),
    0
  );

  const jobs = await Promise.all(
    cenas.map(async (c, index) => {
      const duration = c.duration_hint as VideoDuration;
      try {
        const res = await startVideoRun({
          prompt: c.prompt_en,
          resolution,
          duration,
        });
        return { index, run_id: res.run_id, status: "pendente" as const };
      } catch (e) {
        const err =
          e instanceof MonidError
            ? e
            : new MonidError((e as Error).message, "unknown");
        return {
          index,
          run_id: null,
          status: "falhou" as const,
          error: err.message,
        };
      }
    })
  );

  const noKey =
    jobs.find((j) => j.status === "falhou" && /MONID_API_KEY/.test(j.error || ""));
  if (noKey) {
    return NextResponse.json(
      { ok: false, message: noKey.error },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    jobs,
    est_cost_usd: Number(estCost.toFixed(2)),
    resolution,
  });
}