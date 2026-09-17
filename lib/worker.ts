import cron from "node-cron";
import { getUserById, listActiveWatches, saveWatchCheck } from "./db";
import { isPastDate } from "./kst";
import { searchSeats, summarizeSeats } from "./seats";
import { sendKakaoMemo, watchAlertText } from "./kakao";
import { POLL_INTERVAL_MS } from "./types";
import type { Watch } from "./types";

const globalForWorker = globalThis as unknown as {
  ktxWorkerStarted?: boolean;
  ktxTickRunning?: boolean;
};

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkWatch(watch: Watch) {
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
    const trains = await searchSeats({
      dep: watch.korailDep,
      arr: watch.korailArr,
      date: watch.date,
      timeStart: watch.timeStart,
      timeEnd: watch.timeEnd,
    });
    const result = summarizeSeats(trains);
    let notifiedAt: number | null = null;

    if (result.available && !watch.lastSeatAvailable) {
      const user = getUserById(watch.userId);
      if (user && user.kakaoId !== "local" && user.accessToken) {
        const sent = await sendKakaoMemo(
          watch.userId,
          watchAlertText(watch, result.highlight, result.summary),
        );
        if (sent.ok) notifiedAt = Date.now();
      }
    }

    saveWatchCheck(watch.id, {
      lastCheckedAt: Date.now(),
      lastStatus: result.available ? "available" : "soldout",
      lastSummary: result.summary,
      lastSeatAvailable: result.available,
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

export async function tickAll() {
  if (globalForWorker.ktxTickRunning) return;
  globalForWorker.ktxTickRunning = true;
  try {
    const watches = listActiveWatches();
    for (const watch of watches) {
      await checkWatch(watch);
      await sleep(1500);
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
