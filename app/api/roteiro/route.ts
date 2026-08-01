import { NextRequest, NextResponse } from "next/server";
import {
  generateRoteiro,
  GenerateRoteiroError,
} from "@/lib/ai/generate-roteiro";
import { emptyBrief, type Brief } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DURATION: ReadonlySet<number> = new Set([30, 60]);

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readBrief(input: unknown): Brief {
  if (!isStringRecord(input)) return { ...emptyBrief };
  const s = (k: keyof Brief) =>
    typeof input[k] === "string" ? (input[k] as string) : "";
  return {
    produto: s("produto"),
    publico_alvo: s("publico_alvo"),
    objetivo: s("objetivo"),
    tom: s("tom"),
    idioma: s("idioma") || "pt-BR",
    cta: s("cta"),
    estilo_visual: s("estilo_visual"),
    referencias: s("referencias"),
  };
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
  const data = (body ?? {}) as { brief?: unknown; durationSeconds?: unknown };
  const durationSeconds =
    typeof data.durationSeconds === "number"
      ? data.durationSeconds
      : Number(data.durationSeconds);

  if (!ALLOWED_DURATION.has(durationSeconds)) {
    return NextResponse.json(
      { ok: false, message: "Duração inválida (use 30 ou 60)." },
      { status: 400 }
    );
  }
  const brief = readBrief(data.brief);
  if (!brief.produto.trim() || !brief.cta.trim()) {
    return NextResponse.json(
      { ok: false, message: "Brief incompleto: informe produto e CTA." },
      { status: 400 }
    );
  }

  try {
    const roteiro = await generateRoteiro({
      brief,
      durationSeconds: durationSeconds as 30 | 60,
    });
    return NextResponse.json({ ok: true, roteiro });
  } catch (e) {
    if (e instanceof GenerateRoteiroError) {
      const status =
        e.kind === "invalid_input"
          ? 400
          : e.kind === "parse"
            ? 502
            : e.kind === "provider"
              ? 503
              : 500;
      return NextResponse.json(
        { ok: false, message: e.message },
        { status }
      );
    }
    return NextResponse.json(
      { ok: false, message: "Erro inesperado ao gerar roteiro." },
      { status: 500 }
    );
  }
}