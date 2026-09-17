import { compactDate, compactTimeToHhmm, hhmmToCompact } from "./kst";
import type { SeatTrain } from "./types";

const SEARCH_URL =
  "https://smart.letskorail.com/classes/com.korail.mobile.seatMovie.ScheduleView";
const REMAINDER_URL = "https://m.letskorail.com/file/iris/rdxx990_ba_r1";

const TIME_SLOTS = [
  { id: "1", start: "00:00", end: "06:00" },
  { id: "2", start: "06:00", end: "10:00" },
  { id: "3", start: "10:00", end: "13:00" },
  { id: "4", start: "13:00", end: "16:00" },
  { id: "5", start: "16:00", end: "20:00" },
  { id: "6", start: "20:00", end: "24:00" },
] as const;

const GYEONGBU = [
  "행신",
  "서울",
  "용산",
  "영등포",
  "광명",
  "수원",
  "평택지제",
  "천안아산",
  "오송",
  "대전",
  "김천구미",
  "서대구",
  "동대구",
  "신경주",
  "울산",
  "부산",
];
const HONAM = ["용산", "공주", "익산", "정읍", "광주송정", "나주", "목포"];
const JEOLLA = ["익산", "전주", "남원", "순천", "여수엑스포"];
const GANGNEUNG = ["청량리", "상봉", "양평", "만종", "횡성", "둔내", "평창", "진부", "강릉"];

type KorailTrain = {
  h_trn_no?: string;
  h_trn_clsf_nm?: string;
  h_dpt_rs_stn_nm?: string;
  h_arv_rs_stn_nm?: string;
  h_dpt_dt?: string;
  h_dpt_tm?: string;
  h_arv_tm?: string;
  h_gen_rsv_cd?: string;
  h_spe_rsv_cd?: string;
};

type KorailResponse = {
  strResult?: string;
  h_msg_cd?: string;
  h_msg_txt?: string;
  trn_infos?: { trn_info?: KorailTrain | KorailTrain[] };
};

function isAvailable(code?: string) {
  return code === "11";
}

function isKtx(name?: string) {
  return (name ?? "").toUpperCase().includes("KTX");
}

function toList<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mapTrain(row: KorailTrain): SeatTrain {
  return {
    trainNo: row.h_trn_no ?? "",
    trainName: row.h_trn_clsf_nm ?? "KTX",
    depName: row.h_dpt_rs_stn_nm ?? "",
    arrName: row.h_arv_rs_stn_nm ?? "",
    depDate: row.h_dpt_dt ?? "",
    depTime: compactTimeToHhmm(row.h_dpt_tm ?? "000000"),
    arrTime: compactTimeToHhmm(row.h_arv_tm ?? "000000"),
    general: isAvailable(row.h_gen_rsv_cd),
    special: isAvailable(row.h_spe_rsv_cd),
  };
}

function isBlocked(json: KorailResponse) {
  return json.h_msg_cd === "MACRO ERROR" || (json.h_msg_txt ?? "").includes("최신 버전");
}

async function searchPage(input: {
  dep: string;
  arr: string;
  date: string;
  time: string;
}): Promise<{ trains: SeatTrain[]; blocked: boolean }> {
  const params = new URLSearchParams({
    Device: "AD",
    Version: "250601002",
    radJobId: "1",
    selGoTrain: "00",
    txtTrnGpCd: "100",
    txtGoStart: input.dep,
    txtGoEnd: input.arr,
    txtGoAbrdDt: compactDate(input.date),
    txtGoHour: input.time,
    txtPsgFlg_1: "1",
    txtPsgFlg_2: "0",
    txtPsgFlg_3: "0",
    txtPsgFlg_4: "0",
    txtPsgFlg_5: "0",
    txtPsgFlg_8: "0",
    txtSeatAttCd_2: "000",
    txtSeatAttCd_3: "000",
    txtSeatAttCd_4: "015",
    txtCardPsgCnt: "0",
    txtMenuId: "11",
  });

  const response = await fetch(`${SEARCH_URL}?${params}`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`잔여석 조회 실패 (${response.status})`);
  }

  const json = (await response.json()) as KorailResponse;
  if (isBlocked(json)) {
    return { trains: [], blocked: true };
  }

  const success = json.strResult === "SUCC" || json.h_msg_cd === "P000";
  const noResult = json.h_msg_cd === "P058" || json.h_msg_cd === "WRG000000";
  if (!success && !noResult) {
    throw new Error(json.h_msg_txt || "잔여석 조회에 실패했습니다.");
  }

  return {
    trains: toList(json.trn_infos?.trn_info)
      .map(mapTrain)
      .filter((train) => isKtx(train.trainName)),
    blocked: false,
  };
}

function nextCursor(trains: SeatTrain[]) {
  const last = trains.at(-1);
  if (!last) return null;
  const [hour, minute] = last.depTime.split(":").map(Number);
  const total = hour * 60 + minute + 1;
  if (total >= 24 * 60) return null;
  const nextHour = String(Math.floor(total / 60)).padStart(2, "0");
  const nextMinute = String(total % 60).padStart(2, "0");
  return `${nextHour}${nextMinute}00`;
}

async function searchTrainLevel(input: {
  dep: string;
  arr: string;
  date: string;
  timeStart: string;
  timeEnd: string;
}): Promise<{ trains: SeatTrain[]; blocked: boolean }> {
  const collected: SeatTrain[] = [];
  const seen = new Set<string>();
  let cursor = hhmmToCompact(input.timeStart);

  for (let page = 0; page < 3; page += 1) {
    const { trains, blocked } = await searchPage({
      dep: input.dep,
      arr: input.arr,
      date: input.date,
      time: cursor,
    });
    if (blocked) return { trains: [], blocked: true };

    for (const train of trains) {
      if (train.depTime < input.timeStart || train.depTime > input.timeEnd) continue;
      const key = `${train.trainNo}-${train.depTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(train);
    }

    const lastInWindow = trains.filter((train) => train.depTime <= input.timeEnd).at(-1);
    if (!lastInWindow || trains.length === 0) break;
    if (lastInWindow.depTime >= input.timeEnd) break;
    const next = nextCursor(trains);
    if (!next || next <= cursor) break;
    cursor = next;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return { trains: collected.sort((a, b) => a.depTime.localeCompare(b.depTime)), blocked: false };
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

function routeLine(dep: string, arr: string) {
  const inBoth = (list: string[]) => list.includes(dep) && list.includes(arr);
  if (inBoth(GYEONGBU)) return { line: "gyeongbu" as const, stations: GYEONGBU };
  if (inBoth(HONAM)) return { line: "honam" as const, stations: HONAM };
  if (inBoth(JEOLLA)) return { line: "jeolla" as const, stations: JEOLLA };
  if (inBoth(GANGNEUNG)) return { line: "gangneung" as const, stations: GANGNEUNG };
  return null;
}

function publishedLines(srchDt: string) {
  const key = srchDt.slice(0, 10);
  if (key < "2026090315") return ["gyeongbu"];
  if (key < "2026090415") return ["honam", "jeolla", "gangneung"];
  if (key < "2026090713") return ["gyeongbu", "gangneung"];
  if (key < "2026090813") return [] as string[];
  if (key < "2026090913") return ["honam", "jeolla"];
  if (key < "2026091013") return [] as string[];
  return ["gyeongbu"];
}

function slotLabel(id: string) {
  const slot = TIME_SLOTS.find((item) => item.id === id);
  return slot ? `${slot.start}~${slot.end}` : id;
}

function remainderLevel(code: string) {
  if (code === "2") return "많음";
  if (code === "1") return "보통";
  if (code === "0") return "매진";
  return "없음";
}

async function searchRemainder(input: {
  dep: string;
  arr: string;
  date: string;
  timeStart: string;
  timeEnd: string;
}): Promise<SeatTrain[]> {
  const route = routeLine(input.dep, input.arr);
  if (!route) {
    throw new Error("이 구간은 공개 잔여석 현황 노선과 맞지 않습니다. 코레일에서 직접 확인하세요.");
  }

  const response = await fetch(`${REMAINDER_URL}?${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error("코레일 공개 잔여석 현황을 가져오지 못했습니다.");
  }

  const text = await response.text();
  const rows = text.split(/\r?\n/).filter(Boolean);
  const stamp = rows[0]?.split("#")[0] ?? "";
  const lines = publishedLines(stamp);
  if (!lines.includes(route.line)) {
    throw new Error(
      "지금은 코레일 공개 현황이 다른 노선입니다. 열차 단위 조회는 막혀 있어, 해당 노선이 게시될 때 다시 확인합니다.",
    );
  }

  const depIndex = route.stations.indexOf(input.dep);
  const arrIndex = route.stations.indexOf(input.arr);
  const down = depIndex < arrIndex;
  const dateKey = compactDate(input.date);
  const slots = TIME_SLOTS.filter((slot) =>
    overlaps(input.timeStart, input.timeEnd === "24:00" ? "24:00" : input.timeEnd, slot.start, slot.end),
  );

  const trains: SeatTrain[] = [];
  for (const row of rows.slice(1)) {
    const parts = row.split("#");
    if (parts.length < 10) continue;
    if (parts[0] !== dateKey) continue;
    if (!slots.some((slot) => slot.id === parts[1])) continue;
    const code = down ? parts[2] : parts[6];
    const open = code === "1" || code === "2";
    const slot = slotLabel(parts[1] ?? "");
    trains.push({
      trainNo: remainderLevel(code ?? "-"),
      trainName: "KTX 공개현황",
      depName: input.dep,
      arrName: input.arr,
      depDate: dateKey,
      depTime: slot.slice(0, 5),
      arrTime: slot.slice(-5),
      general: open,
      special: false,
    });
  }

  if (trains.length === 0) {
    throw new Error("공개 잔여석 현황에 이 날짜·시간대가 없습니다.");
  }

  return trains;
}

let trainSearchBlockedUntil = 0;

export async function searchSeats(input: {
  dep: string;
  arr: string;
  date: string;
  timeStart: string;
  timeEnd: string;
}): Promise<SeatTrain[]> {
  if (process.env.KTX_TRAIN_SEARCH === "1" && Date.now() >= trainSearchBlockedUntil) {
    try {
      const result = await searchTrainLevel(input);
      if (!result.blocked) return result.trains;
      trainSearchBlockedUntil = Date.now() + 30 * 60 * 1000;
    } catch {
      trainSearchBlockedUntil = Date.now() + 10 * 60 * 1000;
    }
  }
  return searchRemainder(input);
}

export function isRemainderSeats(trains: SeatTrain[]) {
  return trains.some((train) => train.trainName.includes("공개현황"));
}

export function filterSeatsForWatch(trains: SeatTrain[], trainNo: string | null) {
  if (!trainNo || isRemainderSeats(trains)) return trains;
  return trains.filter((train) => train.trainNo === trainNo);
}

export function summarizeSeats(trains: SeatTrain[], watchTrainNo?: string | null) {
  const open = trains.filter((train) => train.general || train.special);
  const remainder = isRemainderSeats(trains);
  const trainLabel = watchTrainNo ? ` #${watchTrainNo}` : "";

  if (open.length === 0) {
    return {
      available: false,
      summary: remainder
        ? `공개 현황 매진${trainLabel} (${trains.map((train) => `${train.depTime} ${train.trainNo}`).join(", ")})`
        : trains.length
          ? watchTrainNo
            ? `#${watchTrainNo} 매진`
            : `매진 (${trains.length}편 확인)`
          : watchTrainNo
            ? `해당 시간에 #${watchTrainNo} 없음`
            : "해당 시간에 열차 없음",
      highlight: null as SeatTrain | null,
    };
  }

  const first = open[0];
  if (remainder) {
    return {
      available: true,
      summary: watchTrainNo
        ? `공개 현황 ${first.depTime}대 ${first.trainNo}. #${watchTrainNo} 확정은 아님. 코레일에서 확인`
        : `공개 현황 ${first.depTime}대 ${first.trainNo}. 열차 단위는 코레일에서 확인`,
      highlight: first,
    };
  }

  const kinds = [first.general ? "일반실" : null, first.special ? "특실" : null].filter(Boolean);
  return {
    available: true,
    summary: `${first.depTime} #${first.trainNo} ${kinds.join("/")} 가능${open.length > 1 ? ` 외 ${open.length - 1}편` : ""}`,
    highlight: first,
  };
}
