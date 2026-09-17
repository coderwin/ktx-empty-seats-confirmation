import { NextRequest, NextResponse } from "next/server";
import { isKakaoConfigured } from "@/lib/auth";
import { kakaoAuthorizeUrl } from "@/lib/kakao";

export function GET(request: NextRequest) {
  if (!isKakaoConfigured()) {
    return NextResponse.redirect(new URL("/?kakao=missing", request.nextUrl.origin));
  }
  return NextResponse.redirect(kakaoAuthorizeUrl());
}
