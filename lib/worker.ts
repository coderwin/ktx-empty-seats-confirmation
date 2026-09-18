import cron from "node-cron";
import { getUserById, listActiveWatches, saveWatchCheck } from "./db";
import { isPastDate } from "./kst";
import {
  directionLabel,
  fetchRemainderSnapshot,
  formatSlotLabel,
  isOpenCode,
  LINE_LABEL,
  slotCodesForWatch,
  tagoWindowFromSlots,
  watchRoute,
  type RemainderSnapshot,
  type SlotCell,
} from "./remainder";
import { sendKakaoMemo, watchAlertText } from "./kakao";
import { fetchTimetable } from "./tago";
import { POLL_INTERVAL_MS } from "./types";
import type { Watch } from "./types";

const globalForWorker = globalThis as unknown as {
  ktxWorkerStarted?: boolean;
  ktxTickRunning?: boolean;
};

export async function checkWatch(watch: Watch, snapshot?: RemainderSnapshot) {
  if (isPastDate(watch.date)) {
    saveWatchCheck(watch.id, {
      lastCheckedAt: Date.now(),
      lastStatus: "expired",
      lastSummary: "날짜가 지나 감시를 종료했습니다.",
      lastSeatAvailable: false,
      active: false,
    });
    return;
  }

  try {
    const snap = snapshot ?? (await fetchRemainderSnapshot());
    const route = watchRoute(watch.korailDep, watch.korailArr);
    if (!route) {
      saveWatchCheck(watch.id, {
        lastCheckedAt: Date.now(),
        lastStatus: "error",
        lastSummary: "이 구간은 공개 잔여석 현황 노선과 맞지 않습니다.",
        lastSeatAvailable: watch.lastSeatAvailable,
      });
      return;
    }

    if (snap.publishedLines.length === 0 || !snap.publishedLines.includes(route.line)) {
      const posted = snap.publishedLabel || "다른 노선";
      saveWatchCheck(watch.id, {
        lastCheckedAt: Date.now(),
        lastStatus: "pending",
        lastSummary: `지금은 ${posted} 게시입니다. ${LINE_LABEL[route.line]}이 올라오면 확인합니다.`,
        lastSeatAvailable: watch.lastSeatAvailable,
      });
      return;
    }

    const matched = slotCodesForWatch(snap, {
      dep: watch.korailDep,
      arr: watch.korailArr,
      date: watch.date,
      slotIds: watch.slotIds,
    });
    if (!matched || matched.selected.length === 0) {
      saveWatchCheck(watch.id, {
        lastCheckedAt: Date.now(),
        lastStatus: "error",
        lastSummary: "감시할 시간칸이 없습니다.",
        lastSeatAvailable: watch.lastSeatAvailable,
      });
      return;
    }

    if (matched.selected.every((cell) => cell.code == null)) {
      saveWatchCheck(watch.id, {
        lastCheckedAt: Date.now(),
        lastStatus: "error",
        lastSummary: "공개 잔여석 현황에 이 날짜가 없습니다.",
        lastSeatAvailable: watch.lastSeatAvailable,
      });
      return;
    }

    const dir = directionLabel(route.direction);
    const summary = `${dir} ${matched.selected.map((cell) => `${formatSlotLabel(cell.id)} ${cell.level}`).join(", ")}`;
    const available = matched.selected.some((cell) => cell.open);
    const opened = matched.selected.filter(
      (cell) => cell.open && !isOpenCode(watch.lastSlotCodes[cell.id]),
    );
    const nextCodes = { ...watch.lastSlotCodes };
    for (const cell of matched.selected) {
      nextCodes[cell.id] = cell.code ?? "-";
    }

    let notifiedAt: number | null = null;
    if (opened.length > 0) {
      const user = getUserById(watch.userId);
      if (user && user.kakaoId !== "local" && user.accessToken) {
        const trains = await trainsForSlots(watch, opened);
        const sent = await sendKakaoMemo(
          watch.userId,
          watchAlertText({
            watch,
            directionLabel: dir,
            opened: opened.map((cell) => ({
              label: formatSlotLabel(cell.id),
              level: cell.level,
            })),
            trains,
          }),
        );
        if (sent.ok) notifiedAt = Date.now();
      }
    }

    saveWatchCheck(watch.id, {
      lastCheckedAt: Date.now(),
      lastStatus: available ? "available" : "soldout",
      lastSummary: summary,
      lastSeatAvailable: available,
      lastSlotCodes: nextCodes,
      lastNotifiedAt: notifiedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회 오류";
    saveWatchCheck(watch.id, {
      lastCheckedAt: Date.now(),
      lastStatus: "error",
      lastSummary: message,
      lastSeatAvailable: watch.lastSeatAvailable,
    });
  }
}

async function trainsForSlots(watch: Watch, opened: SlotCell[]) {
  const window = tagoWindowFromSlots(opened.map((cell) => cell.id));
  const result = await fetchTimetable({
    depTagoId: watch.depTagoId,
    arrTagoId: watch.arrTagoId,
    date: watch.date,
    timeStart: window.timeStart,
    timeEnd: window.timeEnd,
  });
  return result.trains.slice(0, 4).map((train) => ({
    depTime: train.depTime,
    trainNo: train.trainNo,
  }));
}

export async function tickAll() {
  if (globalForWorker.ktxTickRunning) return;
  globalForWorker.ktxTickRunning = true;
  try {
    const watches = listActiveWatches();
    if (watches.length === 0) return;
    const snapshot = await fetchRemainderSnapshot(true);
    for (const watch of watches) {
      await checkWatch(watch, snapshot);
    }
  } finally {
    globalForWorker.ktxTickRunning = false;
  }
}

export function startWorker() {
  if (globalForWorker.ktxWorkerStarted) return;
  globalForWorker.ktxWorkerStarted = true;

  cron.schedule("* * * * *", () => {
    void tickAll();
  });

  setTimeout(() => {
    void tickAll();
  }, Math.min(POLL_INTERVAL_MS, 8_000));
}
