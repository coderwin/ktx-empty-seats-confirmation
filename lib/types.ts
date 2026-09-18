export const MAX_WATCHES = 5;
export const POLL_INTERVAL_MS = 60_000;
export const KORAIL_BOOK_URL = "https://www.letskorail.com";

export type Station = {
  name: string;
  korailName: string;
  tagoId: string;
};

export type WatchStatus = "soldout" | "available" | "error" | "expired" | "pending";

export type User = {
  id: number;
  kakaoId: string;
  nickname: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
};

export type Watch = {
  id: number;
  userId: number;
  depName: string;
  arrName: string;
  depTagoId: string;
  arrTagoId: string;
  korailDep: string;
  korailArr: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  slotIds: string[];
  trainType: string;
  active: boolean;
  lastCheckedAt: number | null;
  lastStatus: WatchStatus;
  lastSummary: string | null;
  lastSeatAvailable: boolean;
  lastSlotCodes: Record<string, string>;
  lastNotifiedAt: number | null;
  createdAt: number;
};

export type TimetableTrain = {
  trainNo: string;
  trainName: string;
  depName: string;
  arrName: string;
  depTime: string;
  arrTime: string;
  charge: number | null;
};
