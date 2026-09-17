import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteWatch, getWatch, updateWatch } from "@/lib/db";
import { checkWatch } from "@/lib/worker";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const { id } = await context.params;
  const watchId = Number(id);
  const existing = getWatch(watchId, user.id);
  if (!existing) {
    return NextResponse.json({ error: "감시를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = (await request.json()) as { active?: boolean; refresh?: boolean };
  if (body.refresh) {
    await checkWatch(existing);
    return NextResponse.json({ watch: getWatch(watchId, user.id) });
  }

  const watch = updateWatch(watchId, user.id, { active: body.active });
  return NextResponse.json({ watch });
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;
  const { id } = await context.params;
  const ok = deleteWatch(Number(id), user.id);
  if (!ok) {
    return NextResponse.json({ error: "감시를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
