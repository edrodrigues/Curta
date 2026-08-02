import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z0-9_-]{3,40}$/;

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Acesso não autorizado." },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("credit_coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, coupons: data });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Acesso não autorizado." },
      { status: 403 }
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

  const data = (body ?? {}) as {
    code?: unknown;
    credits?: unknown;
    maxRedemptions?: unknown;
    expiresAt?: unknown;
  };

  const code = typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
  const credits =
    typeof data.credits === "number" ? data.credits : Number(data.credits);
  const maxRedemptions =
    data.maxRedemptions === null || data.maxRedemptions === undefined || data.maxRedemptions === ""
      ? null
      : Number(data.maxRedemptions);
  const expiresAt =
    typeof data.expiresAt === "string" && data.expiresAt.trim() ? data.expiresAt.trim() : null;

  if (!CODE_RE.test(code)) {
    return NextResponse.json(
      { ok: false, message: "Código inválido (use 3–40 letras/números, - ou _)." },
      { status: 400 }
    );
  }
  if (!Number.isInteger(credits) || credits <= 0) {
    return NextResponse.json(
      { ok: false, message: "Informe uma quantidade de créditos válida (inteiro > 0)." },
      { status: 400 }
    );
  }
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0)) {
    return NextResponse.json(
      { ok: false, message: "Limite de usos inválido (inteiro > 0, ou deixe em branco)." },
      { status: 400 }
    );
  }
  if (expiresAt !== null && Number.isNaN(new Date(expiresAt).getTime())) {
    return NextResponse.json(
      { ok: false, message: "Data de validade inválida." },
      { status: 400 }
    );
  }

  const { data: coupon, error } = await supabaseAdmin()
    .from("credit_coupons")
    .insert({
      code,
      credits,
      max_redemptions: maxRedemptions,
      expires_at: expiresAt,
      created_by: admin.id,
    })
    .select("*")
    .single();

  if (error) {
    const message = error.code === "23505" ? "Já existe um cupom com esse código." : error.message;
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, coupon });
}
