import { getUserById, updateUserTokens } from "./db";
import { KORAIL_BOOK_URL } from "./types";
import type { SeatTrain, Watch } from "./types";

const AUTH_URL = "https://kauth.kakao.com";
const API_URL = "https://kapi.kakao.com";

export function kakaoRedirectUri() {
  return process.env.KAKAO_REDIRECT_URI ?? "http://localhost:3000/api/auth/kakao/callback";
}

export function kakaoAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: kakaoRedirectUri(),
    response_type: "code",
    scope: "profile_nickname,talk_message",
  });
  return `${AUTH_URL}/oauth/authorize?${params}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(`${AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    cache: "no-store",
  });
  const json = (await response.json()) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "카카오 토큰 요청 실패");
  }
  return json;
}

export async function exchangeKakaoCode(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: kakaoRedirectUri(),
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET) {
    body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  }
  return tokenRequest(body);
}

export async function refreshKakaoToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    refresh_token: refreshToken,
  });
  if (process.env.KAKAO_CLIENT_SECRET) {
    body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  }
  return tokenRequest(body);
}

export async function fetchKakaoProfile(accessToken: string) {
  const response = await fetch(`${API_URL}/v2/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = (await response.json()) as {
    id?: number;
    kakao_account?: { profile?: { nickname?: string } };
    properties?: { nickname?: string };
    msg?: string;
  };
  if (!response.ok || !json.id) {
    throw new Error(json.msg || "카카오 사용자 정보를 가져오지 못했습니다.");
  }
  return {
    kakaoId: String(json.id),
    nickname:
      json.kakao_account?.profile?.nickname || json.properties?.nickname || "카카오 사용자",
  };
}

async function validAccessToken(userId: number) {
  const user = getUserById(userId);
  if (!user?.accessToken) return null;

  const stillValid = user.tokenExpiresAt && user.tokenExpiresAt - 60_000 > Date.now();
  if (stillValid) return user.accessToken;
  if (!user.refreshToken) return user.accessToken;

  try {
    const tokens = await refreshKakaoToken(user.refreshToken);
    const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
    updateUserTokens(userId, tokens.access_token!, tokens.refresh_token ?? null, expiresAt);
    return tokens.access_token!;
  } catch {
    return user.accessToken;
  }
}

export function watchAlertText(watch: Watch, train: SeatTrain | null, summary: string) {
  const kinds = train
    ? [train.general ? "일반실" : null, train.special ? "특실" : null].filter(Boolean).join("/")
    : "";
  const lines = [
    `KTX 잔여석: ${watch.depName}→${watch.arrName}${watch.trainNo ? ` #${watch.trainNo}` : ""}`,
    `${watch.date} ${train ? `${train.depTime} ${train.trainName.includes("공개현황") ? train.trainNo : `#${train.trainNo}`}` : watch.timeStart}`,
    kinds ? `${kinds} 가능` : summary,
    "예매는 코레일에서 직접 하세요.",
  ];
  return lines.join("\n").slice(0, 200);
}

export async function sendKakaoMemo(userId: number, text: string) {
  const accessToken = await validAccessToken(userId);
  if (!accessToken) return { ok: false, error: "카카오 로그인이 필요합니다." };

  const template = {
    object_type: "text",
    text,
    link: {
      web_url: KORAIL_BOOK_URL,
      mobile_web_url: KORAIL_BOOK_URL,
    },
    button_title: "코레일 예매",
  };

  const response = await fetch(`${API_URL}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
    cache: "no-store",
  });

  const json = (await response.json()) as { result_code?: number; msg?: string };
  if (!response.ok || json.result_code !== 0) {
    return { ok: false, error: json.msg || "카카오 메시지 전송에 실패했습니다." };
  }
  return { ok: true };
}
