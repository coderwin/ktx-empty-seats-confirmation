import { NextRequest, NextResponse } from "next/server";
import { attachSession } from "@/lib/auth";
import { upsertKakaoUser } from "@/lib/db";
import { exchangeKakaoCode, fetchKakaoProfile } from "@/lib/kakao";

function appOrigin(request: NextRequest) {
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const kakaoError = request.nextUrl.searchParams.get("error");

  if (kakaoError || !code) {
    return NextResponse.redirect(new URL("/?kakao=denied", origin));
  }

  try {
    const tokens = await exchangeKakaoCode(code);
    const profile = await fetchKakaoProfile(tokens.access_token!);
    const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
    const user = upsertKakaoUser({
      kakaoId: profile.kakaoId,
      nickname: profile.nickname,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: expiresAt,
    });
    await attachSession(user.id);
    return NextResponse.redirect(new URL("/", origin));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "카카오 로그인에 실패했습니다.";
    const url = new URL("/?kakao=error", origin);
    url.searchParams.set("reason", reason.slice(0, 180));
    return NextResponse.redirect(url);
  }
}
