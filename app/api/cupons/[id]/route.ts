import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const isActive = (body as { isActive?: unknown })?.isActive;
  if (typeof isActive !== "boolean") {
    return NextResponse.json(
      { ok: false, message: "Informe isActive (boolean)." },
      { status: 400 }
    );
  }

  const { data: coupon, error } = await supabaseAdmin()
    .from("credit_coupons")
    .update({ is_active: isActive })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, coupon });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Acesso não autorizado." },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin()
    .from("credit_coupons")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
