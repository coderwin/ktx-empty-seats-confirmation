"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCheckedAt, formatDateLabel, kstToday, kstTomorrow } from "@/lib/kst";
import { formatSlotList, TIME_SLOTS } from "@/lib/remainder";
import { KORAIL_BOOK_URL, MAX_WATCHES } from "@/lib/types";
import type { Station, TimetableTrain, Watch, WatchStatus } from "@/lib/types";

type Me = {
  user: { id: number; nickname: string; kakaoConnected: boolean; isLocal: boolean } | null;
  kakaoConfigured: boolean;
  tagoConfigured: boolean;
};

type SlotCell = {
  id: string;
  start: string;
  end: string;
  code: string | null;
  level: string;
  open: boolean;
};

type RemainderBoard = {
  error?: string;
  lineLabel?: string;
  direction?: "down" | "up";
  directionLabel?: string;
  published?: boolean;
  hasDate?: boolean;
  publishedLabel?: string;
  stampLabel?: string;
  down?: SlotCell[];
  up?: SlotCell[];
};

const statusLabel: Record<WatchStatus, string> = {
  available: "잔여석",
  soldout: "매진",
  error: "조회 실패",
  expired: "종료",
  pending: "대기",
};

function statusClass(status: WatchStatus) {
  switch (status) {
    case "available":
      return "bg-[#e8f6ee] text-[#1f7a4d]";
    case "soldout":
      return "bg-[#eeeae3] text-[#5c6570]";
    case "error":
      return "bg-[#fff4d6] text-[#9a6700]";
    case "expired":
      return "bg-[#f3eee4] text-[#8a8173]";
    default:
      return "bg-[#e8eef6] text-[#16324f]";
  }
}

function cellClass(cell: SlotCell, selected: boolean, mine: boolean) {
  if (selected) return "bg-[#16324f] text-white";
  if (cell.open) return mine ? "bg-[#e8f6ee] text-[#1f7a4d]" : "bg-[#f3f8f4] text-[#1f7a4d]";
  if (cell.level === "매진") return mine ? "bg-[#eeeae3] text-[#5c6570]" : "bg-[#f7f4ee] text-[#8a8173]";
  return "bg-[#f7f3ea] text-[#8a8173]";
}

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [depName, setDepName] = useState("서울");
  const [arrName, setArrName] = useState("부산");
  const [date, setDate] = useState(kstTomorrow());
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [board, setBoard] = useState<RemainderBoard | null>(null);
  const [trains, setTrains] = useState<TimetableTrain[]>([]);
  const [timetableError, setTimetableError] = useState("");

  const loadMe = useCallback(async () => {
    const response = await fetch("/api/auth/me");
    const json = (await response.json()) as Me;
    setMe(json);
    return json;
  }, []);

  const loadWatches = useCallback(async () => {
    const response = await fetch("/api/watches");
    if (!response.ok) return;
    const json = (await response.json()) as { watches: Watch[] };
    setWatches(json.watches);
  }, []);

  useEffect(() => {
    void (async () => {
      const [meJson, stationRes] = await Promise.all([
        loadMe(),
        fetch("/api/stations").then((res) => res.json() as Promise<{ stations: Station[] }>),
      ]);
      setStations(stationRes.stations);
      if (meJson.user) await loadWatches();
    })();
  }, [loadMe, loadWatches]);

  useEffect(() => {
    if (!me?.user) return;
    const timer = setInterval(() => {
      void loadWatches();
    }, 20_000);
    return () => clearInterval(timer);
  }, [me?.user, loadWatches]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kakao = params.get("kakao");
    if (kakao === "missing") setError("카카오 REST API 키를 .env.local에 넣으세요.");
    if (kakao === "denied") setError("카카오 로그인이 취소되었습니다.");
    if (kakao === "error") {
      setError(params.get("reason") || "카카오 로그인에 실패했습니다. Redirect URI와 Client Secret을 확인하세요.");
    }
  }, []);

  useEffect(() => {
    if (!me?.user) {
      setBoard(null);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ dep: depName, arr: arrName, date });
        const response = await fetch(`/api/remainder?${params}`);
        const json = (await response.json()) as RemainderBoard;
        setBoard(json);
        setSelectedSlots((current) => current.filter((id) => TIME_SLOTS.some((slot) => slot.id === id)));
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [me?.user, depName, arrName, date]);

  useEffect(() => {
    if (!me?.user || !me.tagoConfigured) {
      setTrains([]);
      setTimetableError(me && !me.tagoConfigured ? "TAGO 키가 없어 시간표 미리보기는 생략합니다." : "");
      return;
    }
    if (selectedSlots.length === 0) {
      setTrains([]);
      setTimetableError("");
      return;
    }
    const slots = TIME_SLOTS.filter((slot) => selectedSlots.includes(slot.id));
    const timeStart = slots[0]?.start ?? "00:00";
    const timeEnd = slots.at(-1)?.end === "24:00" ? "23:59" : (slots.at(-1)?.end ?? "23:59");
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ dep: depName, arr: arrName, date, timeStart, timeEnd });
        const response = await fetch(`/api/timetable?${params}`);
        const json = (await response.json()) as { trains?: TimetableTrain[]; error?: string };
        setTrains(json.trains ?? []);
        setTimetableError(json.error ?? "");
      })();
    }, 400);
    return () => clearTimeout(timer);
  }, [me, depName, arrName, date, selectedSlots]);

  const remaining = MAX_WATCHES - watches.length;
  const stationOptions = useMemo(
    () =>
      stations.map((station) => (
        <option key={station.name} value={station.name}>
          {station.name}
        </option>
      )),
    [stations],
  );

  async function loginLocal() {
    setError("");
    const response = await fetch("/api/auth/local", { method: "POST" });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "로컬 시작에 실패했습니다.");
      return;
    }
    const next = await loadMe();
    if (next.user) await loadWatches();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setWatches([]);
    await loadMe();
  }

  async function sendTest() {
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/notify/test", { method: "POST" });
    const json = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(json.error ?? "테스트 알림에 실패했습니다.");
      return;
    }
    setNotice("카카오톡으로 테스트 메시지를 보냈습니다.");
  }

  async function addWatch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        depName,
        arrName,
        date,
        slotIds: selectedSlots,
      }),
    });
    const json = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(json.error ?? "감시 등록에 실패했습니다.");
      return;
    }
    await loadWatches();
    setSelectedSlots([]);
  }

  async function patchWatch(id: number, body: { active?: boolean; refresh?: boolean }) {
    setBusy(true);
    const response = await fetch(`/api/watches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!response.ok) {
      const json = (await response.json()) as { error?: string };
      setError(json.error ?? "변경에 실패했습니다.");
      return;
    }
    await loadWatches();
  }

  async function removeWatch(id: number) {
    setBusy(true);
    await fetch(`/api/watches/${id}`, { method: "DELETE" });
    setBusy(false);
    await loadWatches();
  }

  function swapStations() {
    setDepName(arrName);
    setArrName(depName);
    setSelectedSlots([]);
  }

  function toggleSlot(id: string) {
    setSelectedSlots((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id].sort(),
    );
  }

  const rows = [
    { key: "down" as const, label: "하행", cells: board?.down ?? [] },
    { key: "up" as const, label: "상행", cells: board?.up ?? [] },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-5 pb-16 pt-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 text-white">
        <div>
          <p className="text-xs tracking-[0.22em] text-[#d4a017]">PERSONAL KTX WATCH</p>
          <h1 className="mt-2 text-3xl font-bold">KTX 잔여석 알림</h1>
          <p className="mt-2 max-w-xl text-sm text-white/75">
            공개 현황의 시간칸이 열리면 카카오톡으로 알려 줍니다. 어느 편인지는{" "}
            <a className="underline decoration-[#d4a017] underline-offset-4" href={KORAIL_BOOK_URL} target="_blank" rel="noreferrer">
              코레일
            </a>
            에서 확인하세요.
          </p>
        </div>
        {me?.user ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm">{me.user.nickname}</span>
            {me.user.kakaoConnected ? (
              <button
                className="rounded-full bg-white px-3 py-1 text-sm text-[#122033] disabled:opacity-50"
                onClick={() => void sendTest()}
                disabled={busy}
                type="button"
              >
                테스트 알림
              </button>
            ) : null}
            <button className="rounded-full border border-white/30 px-3 py-1 text-sm" onClick={() => void logout()} type="button">
              로그아웃
            </button>
          </div>
        ) : null}
      </header>

      {!me ? (
        <section className="rounded-2xl bg-[#fffdf8] p-8 shadow-sm">불러오는 중...</section>
      ) : !me.user ? (
        <section className="rounded-2xl bg-[#fffdf8] p-8 shadow-sm">
          <h2 className="text-xl font-bold">시작하기</h2>
          <p className="mt-2 text-sm text-[#5c6570]">
            카카오로 로그인하면 칸이 열릴 때 나에게 보내기로 알림을 받습니다. 키를 아직 안 넣었다면 로컬로 감시 화면만 먼저 쓸 수 있습니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {me.kakaoConfigured ? (
              <a className="rounded-full bg-[#FEE500] px-5 py-2.5 text-sm font-bold text-[#191919]" href="/api/auth/kakao">
                카카오로 로그인
              </a>
            ) : (
              <span className="rounded-full bg-[#eeeae3] px-5 py-2.5 text-sm text-[#5c6570]">
                KAKAO_REST_API_KEY가 없습니다
              </span>
            )}
            <button className="rounded-full bg-[#16324f] px-5 py-2.5 text-sm font-bold text-white" onClick={() => void loginLocal()} type="button">
              로컬로 시작
            </button>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <form className="rounded-2xl bg-[#fffdf8] p-6 shadow-sm" onSubmit={(event) => void addWatch(event)}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">감시 등록</h2>
              <span className="text-xs text-[#5c6570]">남은 자리 {remaining}/{MAX_WATCHES}</span>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="text-sm">
                출발
                <select className="mt-1 w-full rounded-xl border border-[#d8d0c2] bg-white px-3 py-2" value={depName} onChange={(e) => setDepName(e.target.value)}>
                  {stationOptions}
                </select>
              </label>
              <button className="mb-1 rounded-full border border-[#d8d0c2] px-3 py-2 text-xs" onClick={swapStations} type="button">
                바꾸기
              </button>
              <label className="text-sm">
                도착
                <select className="mt-1 w-full rounded-xl border border-[#d8d0c2] bg-white px-3 py-2" value={arrName} onChange={(e) => setArrName(e.target.value)}>
                  {stationOptions}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              날짜
              <input
                className="mt-1 w-full rounded-xl border border-[#d8d0c2] bg-white px-3 py-2"
                type="date"
                min={kstToday()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>

            <div className="mt-5 border-t border-[#ece6da] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">시간칸 현황</h3>
                {board?.stampLabel ? <span className="text-xs text-[#5c6570]">{board.stampLabel} 기준</span> : null}
              </div>
              {board?.publishedLabel ? (
                <p className="mt-1 text-xs text-[#5c6570]">지금은 {board.publishedLabel} 게시</p>
              ) : null}
              {board?.error ? <p className="mt-2 text-xs text-[#9a6700]">{board.error}</p> : null}
              {!board?.error && board?.published === false ? (
                <p className="mt-2 text-xs text-[#9a6700]">
                  {board.lineLabel}은 지금 게시 대상이 아닙니다. 등록은 할 수 있고, 해당 노선이 올라오면 확인합니다.
                </p>
              ) : null}
              {!board?.error && board?.hasDate === false ? (
                <p className="mt-2 text-xs text-[#9a6700]">이 날짜는 공개 현황에 없습니다. 다른 날짜를 고르세요.</p>
              ) : null}
              {!board?.error && board?.directionLabel ? (
                <p className="mt-1 text-xs text-[#5c6570]">
                  이 구간은 {board.lineLabel} {board.directionLabel}입니다. 칸을 눌러 고르세요.
                </p>
              ) : null}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-center text-xs">
                  <thead>
                    <tr>
                      <th className="pb-2 font-normal text-[#5c6570]" />
                      {TIME_SLOTS.map((slot) => (
                        <th key={slot.id} className="pb-2 font-normal text-[#5c6570]">
                          {slot.start.slice(0, 5)}
                          <br />
                          {slot.end.slice(0, 5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const mine = board?.direction === row.key;
                      return (
                        <tr key={row.key}>
                          <td className={`pr-2 text-left font-bold ${mine ? "text-[#16324f]" : "text-[#8a8173]"}`}>
                            {row.label}
                            {mine ? " · 내 구간" : ""}
                          </td>
                          {TIME_SLOTS.map((slot) => {
                            const cell = row.cells.find((item) => item.id === slot.id) ?? {
                              id: slot.id,
                              start: slot.start,
                              end: slot.end,
                              code: null,
                              level: "없음",
                              open: false,
                            };
                            const selected = mine && selectedSlots.includes(cell.id);
                            return (
                              <td key={`${row.key}-${cell.id}`} className="p-0.5">
                                <button
                                  className={`w-full rounded-lg px-1 py-2 ${cellClass(cell, selected, mine)}`}
                                  disabled={!mine || Boolean(board?.error)}
                                  onClick={() => toggleSlot(cell.id)}
                                  type="button"
                                >
                                  {cell.level}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 border-t border-[#ece6da] pt-4">
              <h3 className="text-sm font-bold">이 칸의 편 (참고)</h3>
              <p className="mt-1 text-xs text-[#5c6570]">빈 편이 아닙니다. 그 시간에 있는 열차 목록입니다.</p>
              {selectedSlots.length === 0 ? (
                <p className="mt-2 text-xs text-[#5c6570]">칸을 고르면 시간표가 나옵니다.</p>
              ) : timetableError ? (
                <p className="mt-2 text-xs text-[#9a6700]">{timetableError}</p>
              ) : trains.length === 0 ? (
                <p className="mt-2 text-xs text-[#5c6570]">해당 칸에 표시할 KTX가 없습니다.</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                  {trains.map((train) => (
                    <li key={`${train.trainNo}-${train.depTime}`} className="flex justify-between rounded-lg bg-[#f7f3ea] px-3 py-1.5">
                      <span>
                        {train.depTime} → {train.arrTime}
                      </span>
                      <span className="text-[#5c6570]">
                        {train.trainName} #{train.trainNo}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-3 text-xs text-[#5c6570]">
              이 칸이 열리면 알림을 보냅니다. 어느 편인지는 코레일에서 확인하세요. 같은 칸이 다시 매진되었다가 열릴 때만 다시 알립니다.
            </p>
            <button
              className="mt-4 w-full rounded-full bg-[#c81e1e] py-3 text-sm font-bold text-white disabled:opacity-50"
              disabled={busy || remaining <= 0 || selectedSlots.length === 0 || Boolean(board?.error)}
              type="submit"
            >
              {selectedSlots.length ? `${formatSlotList(selectedSlots)} 감시 시작` : "칸을 선택하세요"}
            </button>
          </form>

          <section className="rounded-2xl bg-[#fffdf8] p-6 shadow-sm">
            <h2 className="text-lg font-bold">감시 목록</h2>
            {watches.length === 0 ? (
              <p className="mt-6 text-sm text-[#5c6570]">아직 등록한 감시가 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {watches.map((watch) => (
                  <li key={watch.id} className="rounded-2xl border border-[#ece6da] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold">
                          {watch.depName}
                          <span className="mx-2 text-[#d4a017]">→</span>
                          {watch.arrName}
                        </p>
                        <p className="mt-1 text-sm text-[#5c6570]">
                          {formatDateLabel(watch.date)} · {formatSlotList(watch.slotIds)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(watch.lastStatus)}`}>
                        {watch.active ? statusLabel[watch.lastStatus] : "꺼짐"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm">{watch.lastSummary ?? "확인 전"}</p>
                    <p className="mt-1 text-xs text-[#8a8173]">마지막 확인 {formatCheckedAt(watch.lastCheckedAt)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-[#d8d0c2] px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => void patchWatch(watch.id, { refresh: true })}
                        type="button"
                      >
                        지금 확인
                      </button>
                      <button
                        className="rounded-full border border-[#d8d0c2] px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => void patchWatch(watch.id, { active: !watch.active })}
                        type="button"
                      >
                        {watch.active ? "알림 끄기" : "알림 켜기"}
                      </button>
                      <a
                        className="rounded-full bg-[#16324f] px-3 py-1 text-xs text-white"
                        href={KORAIL_BOOK_URL}
                        rel="noreferrer"
                        target="_blank"
                      >
                        코레일 예매
                      </a>
                      <button className="rounded-full px-3 py-1 text-xs text-[#c81e1e]" disabled={busy} onClick={() => void removeWatch(watch.id)} type="button">
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {error ? <p className="mt-4 rounded-xl bg-[#fff1f1] px-4 py-3 text-sm text-[#c81e1e]">{error}</p> : null}
      {notice ? <p className="mt-4 rounded-xl bg-[#e8f6ee] px-4 py-3 text-sm text-[#1f7a4d]">{notice}</p> : null}

      <p className="mt-8 text-xs text-[#5c6570]">
        공식 잔여석 API는 없습니다. 코레일 공개 시간칸 현황만 1분 간격으로 확인하고, 코레일 계정은 저장하지 않습니다.
      </p>
    </div>
  );
}
