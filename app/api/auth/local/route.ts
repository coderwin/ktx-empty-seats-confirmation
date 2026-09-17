import { NextResponse } from "next/server";
import { attachSession, isKakaoConfigured } from "@/lib/auth";
import { upsertKakaoUser } from "@/lib/db";

export async function POST() {
  if (isKakaoConfigured() && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "카카오 로그인을 사용하세요." },
      { status: 400 },
    );
  }

  const user = upsertKakaoUser({
    kakaoId: "local",
    nickname: "로컬 사용자",
    accessToken: "",
    refreshToken: null,
    tokenExpiresAt: null,
  });
  await attachSession(user.id);
  return NextResponse.json({ ok: true });
}
