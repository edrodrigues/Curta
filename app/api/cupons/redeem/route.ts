import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  coupon_not_found: "Cupom não encontrado.",
  coupon_inactive: "Este cupom está inativo.",
  coupon_expired: "Este cupom expirou.",
  coupon_exhausted: "Este cupom atingiu o limite de usos.",
  already_redeemed: "Você já usou este cupom.",
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Faça login para aplicar um cupom." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Corpo da requisição inválido." },
      { status: 400 }
    );
  }

  const code = typeof (body as { code?: unknown })?.code === "string"
    ? (body as { code: string }).code.trim()
    : "";
  if (!code) {
    return NextResponse.json(
      { ok: false, message: "Informe o código do cupom." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin().rpc("redeem_coupon", {
    p_code: code,
    p_user_id: user.id,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Falha ao validar o cupom." },
      { status: 500 }
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ok) {
    const message = MESSAGES[result?.message ?? ""] || "Cupom inválido.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, credits: result.credits });
}
