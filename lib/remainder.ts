import { compactDate } from "./kst";

export const REMAINDER_FILE_URL = "https://m.letskorail.com/file/iris/rdxx990_ba_r1";
export const REMAINDER_PAGE_URL = "https://m.letskorail.com/mbt/m_remainderList.html";

export const TIME_SLOTS = [
  { id: "1", start: "00:00", end: "06:00" },
  { id: "2", start: "06:00", end: "10:00" },
  { id: "3", start: "10:00", end: "13:00" },
  { id: "4", start: "13:00", end: "16:00" },
  { id: "5", start: "16:00", end: "20:00" },
  { id: "6", start: "20:00", end: "24:00" },
] as const;

export type SlotId = (typeof TIME_SLOTS)[number]["id"];
export type LineId = "gyeongbu" | "honam" | "jeolla" | "gangneung";
export type Direction = "down" | "up";

export type SlotCell = {
  id: SlotId;
  start: string;
  end: string;
  code: string | null;
  level: string;
  open: boolean;
};

export type RemainderSnapshot = {
  stamp: string;
  stampLabel: string;
  publishedLines: LineId[];
  publishedLabel: string;
  rows: RemainderRow[];
  fetchedAt: number;
};

type RemainderRow = {
  date: string;
  slotId: string;
  down: string;
  up: string;
};

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

export const LINE_LABEL: Record<LineId, string> = {
  gyeongbu: "경부선",
  honam: "호남선",
  jeolla: "전라선",
  gangneung: "강릉선",
};

const CACHE_MS = 20_000;
const globalForRemainder = globalThis as unknown as {
  ktxRemainderCache?: RemainderSnapshot;
  ktxRemainderInflight?: Promise<RemainderSnapshot>;
};

export function isSlotId(value: string): value is SlotId {
  return TIME_SLOTS.some((slot) => slot.id === value);
}

export function parseSlotIds(value: string | null | undefined): SlotId[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter(isSlotId);
  return [...new Set(ids)].sort();
}

export function serializeSlotIds(ids: string[]) {
  return parseSlotIds(ids.join(",")).join(",");
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  const aEnd = endA === "24:00" ? "24:00" : endA;
  const bEnd = endB === "24:00" ? "24:00" : endB;
  return startA < bEnd && startB < aEnd;
}

export function slotsFromTimeRange(timeStart: string, timeEnd: string): SlotId[] {
  const end = timeEnd === "24:00" ? "24:00" : timeEnd;
  return TIME_SLOTS.filter((slot) => overlaps(timeStart, end, slot.start, slot.end)).map(
    (slot) => slot.id,
  );
}

export function timeRangeFromSlots(ids: string[]) {
  const slots = parseSlotIds(ids.join(","))
    .map((id) => TIME_SLOTS.find((slot) => slot.id === id)!)
    .filter(Boolean);
  if (slots.length === 0) {
    return { timeStart: "06:00", timeEnd: "10:00" };
  }
  return { timeStart: slots[0].start, timeEnd: slots[slots.length - 1].end };
}

export function tagoWindowFromSlots(ids: string[]) {
  const range = timeRangeFromSlots(ids);
  return {
    timeStart: range.timeStart,
    timeEnd: range.timeEnd === "24:00" ? "23:59" : range.timeEnd,
  };
}

export function formatSlotLabel(id: string) {
  const slot = TIME_SLOTS.find((item) => item.id === id);
  if (!slot) return id;
  return `${slot.start.slice(0, 5)}–${slot.end.slice(0, 5)}`;
}

export function formatSlotList(ids: string[]) {
  const parsed = parseSlotIds(ids.join(","));
  return parsed.map(formatSlotLabel).join(", ");
}

export function remainderLevel(code: string | null | undefined) {
  if (code === "2") return "많음";
  if (code === "1") return "보통";
  if (code === "0") return "매진";
  return "없음";
}

export function isOpenCode(code: string | null | undefined) {
  return code === "1" || code === "2";
}

export function routeLine(dep: string, arr: string) {
  const inBoth = (list: string[]) => list.includes(dep) && list.includes(arr);
  if (inBoth(GYEONGBU)) return { line: "gyeongbu" as const, stations: GYEONGBU };
  if (inBoth(HONAM)) return { line: "honam" as const, stations: HONAM };
  if (inBoth(JEOLLA)) return { line: "jeolla" as const, stations: JEOLLA };
  if (inBoth(GANGNEUNG)) return { line: "gangneung" as const, stations: GANGNEUNG };
  return null;
}

export function directionOf(dep: string, arr: string, stations: string[]): Direction {
  return stations.indexOf(dep) < stations.indexOf(arr) ? "down" : "up";
}

export function directionLabel(direction: Direction) {
  return direction === "down" ? "하행" : "상행";
}

function formatStamp(stamp: string) {
  if (stamp.length < 12) return stamp;
  return `${stamp.slice(0, 4)}.${stamp.slice(4, 6)}.${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}`;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePublishedLines(html: string) {
  const fromSpan = html.match(/id=["']strTodayLineName["'][^>]*>([^<]+)/i);
  const text = stripHtml(html);
  const paren = text.match(/\(([^)]*(?:경부|호남|전라|강릉)[^)]*)\)/);
  const publishedLabel = (fromSpan?.[1] ?? paren?.[1] ?? "").replace(/\s+/g, " ").trim();
  const blob = publishedLabel || text;
  const publishedLines: LineId[] = [];
  if (blob.includes("경부")) publishedLines.push("gyeongbu");
  if (blob.includes("호남")) publishedLines.push("honam");
  if (blob.includes("전라")) publishedLines.push("jeolla");
  if (blob.includes("강릉")) publishedLines.push("gangneung");
  return { publishedLines, publishedLabel };
}

function parseRemainderFile(text: string) {
  const rows = text.split(/\r?\n/).filter(Boolean);
  const stamp = rows[0]?.split("#")[0] ?? "";
  const parsed: RemainderRow[] = [];
  for (const row of rows.slice(1)) {
    const parts = row.split("#");
    if (parts.length < 10) continue;
    parsed.push({
      date: parts[0] ?? "",
      slotId: parts[1] ?? "",
      down: parts[2] ?? "-",
      up: parts[6] ?? "-",
    });
  }
  return { stamp, rows: parsed };
}

function emptyCells(): SlotCell[] {
  return TIME_SLOTS.map((slot) => ({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    code: null,
    level: "없음",
    open: false,
  }));
}

function cellsFor(rows: RemainderRow[], dateKey: string, direction: Direction): SlotCell[] {
  const cells = emptyCells();
  for (const row of rows) {
    if (row.date !== dateKey || !isSlotId(row.slotId)) continue;
    const cell = cells.find((item) => item.id === row.slotId);
    if (!cell) continue;
    const code = direction === "down" ? row.down : row.up;
    cell.code = code;
    cell.level = remainderLevel(code);
    cell.open = isOpenCode(code);
  }
  return cells;
}

export function boardFromSnapshot(
  snapshot: RemainderSnapshot,
  input: { dep: string; arr: string; date: string },
) {
  const route = routeLine(input.dep, input.arr);
  if (!route) {
    return {
      error: "이 구간은 공개 잔여석 현황 노선과 맞지 않습니다.",
    };
  }
  const dateKey = compactDate(input.date);
  const direction = directionOf(input.dep, input.arr, route.stations);
  const published = snapshot.publishedLines.includes(route.line);
  const down = cellsFor(snapshot.rows, dateKey, "down");
  const up = cellsFor(snapshot.rows, dateKey, "up");
  const hasDate = snapshot.rows.some((row) => row.date === dateKey);
  return {
    date: input.date,
    line: route.line,
    lineLabel: LINE_LABEL[route.line],
    direction,
    directionLabel: directionLabel(direction),
    published,
    hasDate,
    publishedLines: snapshot.publishedLines.map((id) => ({ id, label: LINE_LABEL[id] })),
    publishedLabel: stripHtml(
      snapshot.publishedLabel || snapshot.publishedLines.map((id) => LINE_LABEL[id]).join(", "),
    ),
    stampLabel: snapshot.stampLabel,
    down,
    up,
  };
}

async function loadSnapshot(): Promise<RemainderSnapshot> {
  const [fileRes, pageRes] = await Promise.all([
    fetch(`${REMAINDER_FILE_URL}?${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(12_000),
    }),
    fetch(`${REMAINDER_PAGE_URL}?${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
    }),
  ]);

  if (!fileRes.ok) {
    throw new Error("코레일 공개 잔여석 현황을 가져오지 못했습니다.");
  }

  const text = await fileRes.text();
  const { stamp, rows } = parseRemainderFile(text);
  let publishedLines: LineId[] = [];
  let publishedLabel = "";
  if (pageRes.ok) {
    const html = await pageRes.text();
    const parsed = parsePublishedLines(html);
    publishedLines = parsed.publishedLines;
    publishedLabel = parsed.publishedLabel;
  }

  return {
    stamp,
    stampLabel: formatStamp(stamp),
    publishedLines,
    publishedLabel,
    rows,
    fetchedAt: Date.now(),
  };
}

export async function fetchRemainderSnapshot(force = false): Promise<RemainderSnapshot> {
  const cached = globalForRemainder.ktxRemainderCache;
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached;
  }
  if (!force && globalForRemainder.ktxRemainderInflight) {
    return globalForRemainder.ktxRemainderInflight;
  }

  const inflight = loadSnapshot().then((snapshot) => {
    globalForRemainder.ktxRemainderCache = snapshot;
    globalForRemainder.ktxRemainderInflight = undefined;
    return snapshot;
  });
  inflight.catch(() => {
    globalForRemainder.ktxRemainderInflight = undefined;
  });
  globalForRemainder.ktxRemainderInflight = inflight;
  return inflight;
}

export function watchRoute(dep: string, arr: string) {
  const route = routeLine(dep, arr);
  if (!route) return null;
  return {
    ...route,
    direction: directionOf(dep, arr, route.stations),
  };
}

export function slotCodesForWatch(
  snapshot: RemainderSnapshot,
  input: { dep: string; arr: string; date: string; slotIds: string[] },
) {
  const route = watchRoute(input.dep, input.arr);
  if (!route) return null;
  const dateKey = compactDate(input.date);
  const cells = cellsFor(snapshot.rows, dateKey, route.direction);
  const selected = parseSlotIds(input.slotIds.join(",")).map((id) => {
    const cell = cells.find((item) => item.id === id)!;
    return cell;
  });
  return { route, selected };
}
