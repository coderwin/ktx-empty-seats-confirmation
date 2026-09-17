export const MAX_WATCHES = 5;
export const POLL_INTERVAL_MS = 60_000;
export const KORAIL_BOOK_URL = "https://www.letskorail.com";

export type SeatClass = "any" | "general" | "special";

export const SEAT_CLASS_LABEL: Record<SeatClass, string> = {
  any: "일반실·특실",
  general: "일반실",
  special: "특실",
};

export function isSeatClass(value: string): value is SeatClass {
  return value === "any" || value === "general" || value === "special";
}

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
  trainType: string;
  trainNo: string | null;
  seatClass: SeatClass;
  active: boolean;
  lastCheckedAt: number | null;
  lastStatus: WatchStatus;
  lastSummary: string | null;
  lastSeatAvailable: boolean;
  lastNotifiedAt: number | null;
  createdAt: number;
};

export type SeatTrain = {
  trainNo: string;
  trainName: string;
  depName: string;
  arrName: string;
  depDate: string;
  depTime: string;
  arrTime: string;
  general: boolean;
  special: boolean;
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
