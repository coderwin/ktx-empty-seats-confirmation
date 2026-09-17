import { compactDate } from "./kst";
import type { TimetableTrain } from "./types";

const TAGO_BASE = "https://apis.data.go.kr/1613000/TrainInfoService";

type TagoItem = {
  trainno?: string;
  traingradename?: string;
  depplacename?: string;
  arrplacename?: string;
  depplandtime?: number | string;
  arrplandtime?: number | string;
  adultcharge?: number | string;
};

function serviceKey() {
  return process.env.TAGO_SERVICE_KEY ?? "";
}

function parseCompactDateTime(value: number | string | undefined) {
  const raw = String(value ?? "");
  if (raw.length < 12) return "";
  return `${raw.slice(8, 10)}:${raw.slice(10, 12)}`;
}

function inWindow(hhmm: string, timeStart: string, timeEnd: string) {
  return hhmm >= timeStart && hhmm <= timeEnd;
}

function isKtxName(name: string) {
  return name.toUpperCase().includes("KTX");
}

export async function fetchTimetable(input: {
  depTagoId: string;
  arrTagoId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
}): Promise<{ trains: TimetableTrain[]; error?: string }> {
  if (!serviceKey()) {
    return { trains: [], error: "TAGO_SERVICE_KEY가 없습니다. 시간표는 건너뛰고 감시만 등록할 수 있습니다." };
  }

  const params = new URLSearchParams({
    serviceKey: serviceKey(),
    pageNo: "1",
    numOfRows: "200",
    _type: "json",
    depPlaceId: input.depTagoId,
    arrPlaceId: input.arrTagoId,
    depPlandTime: compactDate(input.date),
  });

  try {
    const response = await fetch(`${TAGO_BASE}/getStrtpntAlocFndTrainInfo?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return { trains: [], error: `시간표 조회 실패 (${response.status})` };
    }

    const json = (await response.json()) as {
      response?: {
        header?: { resultCode?: string; resultMsg?: string };
        body?: { items?: { item?: TagoItem | TagoItem[] } };
      };
    };

    const code = json.response?.header?.resultCode;
    if (code && code !== "00") {
      return {
        trains: [],
        error: json.response?.header?.resultMsg || "시간표 조회에 실패했습니다.",
      };
    }

    const raw = json.response?.body?.items?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const trains = items
      .map((item) => {
        const trainName = String(item.traingradename ?? "");
        const depTime = parseCompactDateTime(item.depplandtime);
        const arrTime = parseCompactDateTime(item.arrplandtime);
        return {
          trainNo: String(item.trainno ?? ""),
          trainName,
          depName: String(item.depplacename ?? ""),
          arrName: String(item.arrplacename ?? ""),
          depTime,
          arrTime,
          charge: item.adultcharge == null ? null : Number(item.adultcharge),
        } satisfies TimetableTrain;
      })
      .filter(
        (train) =>
          isKtxName(train.trainName) &&
          train.depTime &&
          inWindow(train.depTime, input.timeStart, input.timeEnd),
      )
      .sort((a, b) => a.depTime.localeCompare(b.depTime));

    return { trains };
  } catch (error) {
    const message = error instanceof Error ? error.message : "시간표 조회 중 오류";
    return { trains: [], error: message };
  }
}
