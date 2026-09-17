import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  createSession,
  deleteSession,
  getSessionUser,
} from "./db";
import type { User } from "./types";

export const SESSION_COOKIE = "ktx_session";
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;

export function isKakaoConfigured() {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

export function isTagoConfigured() {
  return Boolean(process.env.TAGO_SERVICE_KEY);
}

export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export async function readSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(token);
}

export async function requireUser() {
  const user = await readSessionUser();
  if (!user) {
    return {
      user: null as User | null,
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }
  return { user, error: null };
}

export async function attachSession(userId: number) {
  const token = newSessionToken();
  const expiresAt = Date.now() + SESSION_MS;
  createSession(userId, token, expiresAt);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  jar.delete(SESSION_COOKIE);
}

export function publicUser(user: User) {
  return {
    id: user.id,
    nickname: user.nickname,
    kakaoConnected: user.kakaoId !== "local" && Boolean(user.accessToken),
    isLocal: user.kakaoId === "local",
  };
}
