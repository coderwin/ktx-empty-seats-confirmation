import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendKakaoMemo } from "@/lib/kakao";

export async function POST() {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const result = await sendKakaoMemo(
    user.id,
    "KTX 잔여석 알림 테스트입니다.\n설정이 정상이면 이 메시지가 카카오톡으로 옵니다.\n예매는 코레일에서 직접 하세요.",
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
