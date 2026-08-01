import { NextRequest, NextResponse } from "next/server";
import {
  generateScript,
  GenerateScriptError,
} from "@/lib/ai/generate-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DURATION: ReadonlySet<number> = new Set([30, 60]);

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

  const data = (body ?? {}) as { url?: unknown; durationSeconds?: unknown };
  const urlRaw = typeof data.url === "string" ? data.url.trim() : "";
  const durationSeconds =
    typeof data.durationSeconds === "number"
      ? data.durationSeconds
      : Number(data.durationSeconds);

  if (!urlRaw) {
    return NextResponse.json(
      { ok: false, message: "Informe a URL do site." },
      { status: 400 }
    );
  }
  if (!ALLOWED_DURATION.has(durationSeconds)) {
    return NextResponse.json(
      { ok: false, message: "Duração inválida (use 30 ou 60)." },
      { status: 400 }
    );
  }

  try {
    const result = await generateScript({
      url: urlRaw,
      durationSeconds: durationSeconds as 30 | 60,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof GenerateScriptError) {
      const status =
        e.kind === "invalid_url" || e.kind === "empty_content"
          ? 400
          : e.kind === "fetch_failed"
            ? 502
            : 503;
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