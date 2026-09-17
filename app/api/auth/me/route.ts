import { NextResponse } from "next/server";
import { isKakaoConfigured, isTagoConfigured, publicUser, readSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await readSessionUser();
  return NextResponse.json({
    user: user ? publicUser(user) : null,
    kakaoConfigured: isKakaoConfigured(),
    tagoConfigured: isTagoConfigured(),
  });
}
