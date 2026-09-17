"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCheckedAt, formatDateLabel, kstToday, kstTomorrow } from "@/lib/kst";
import { KORAIL_BOOK_URL, MAX_WATCHES } from "@/lib/types";
import type { Station, TimetableTrain, Watch, WatchStatus } from "@/lib/types";

type Me = {
  user: { id: number; nickname: string; kakaoConnected: boolean; isLocal: boolean } | null;
  kakaoConfigured: boolean;
  tagoConfigured: boolean;
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
  const [timeStart, setTimeStart] = useState("06:00");
  const [timeEnd, setTimeEnd] = useState("09:00");
  const [trains, setTrains] = useState<TimetableTrain[]>([]);
  const [timetableError, setTimetableError] = useState("");
  const [selectedTrain, setSelectedTrain] = useState<TimetableTrain | null>(null);

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
    if (!me?.user || !me.tagoConfigured) {
      setTrains([]);
      setTimetableError(me && !me.tagoConfigured ? "TAGO 키가 없어 시간표 미리보기는 생략합니다." : "");
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ dep: depName, arr: arrName, date, timeStart, timeEnd });
        const response = await fetch(`/api/timetable?${params}`);
        const json = (await response.json()) as { trains?: TimetableTrain[]; error?: string };
        setTrains(json.trains ?? []);
        setTimetableError(json.error ?? "");
        setSelectedTrain((current) => {
          if (!current) return null;
          return (json.trains ?? []).some(
            (train) => train.trainNo === current.trainNo && train.depTime === current.depTime,
          )
            ? current
            : null;
        });
      })();
    }, 400);
    return () => clearTimeout(timer);
  }, [me, depName, arrName, date, timeStart, timeEnd]);

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
        timeStart,
        timeEnd,
        trainNo: selectedTrain?.trainNo ?? null,
      }),
    });
    const json = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(json.error ?? "감시 등록에 실패했습니다.");
      return;
    }
    await loadWatches();
    setSelectedTrain(null);
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
    setSelectedTrain(null);
  }

  function toggleTrain(train: TimetableTrain) {
    setSelectedTrain((current) =>
      current?.trainNo === train.trainNo && current.depTime === train.depTime ? null : train,
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-5 pb-16 pt-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 text-white">
        <div>
          <p className="text-xs tracking-[0.22em] text-[#d4a017]">PERSONAL KTX WATCH</p>
          <h1 className="mt-2 text-3xl font-bold">KTX 잔여석 알림</h1>
          <p className="mt-2 max-w-xl text-sm text-white/75">
            자리가 나면 카카오톡으로 한 번 알려 줍니다. 예매는{" "}
            <a className="underline decoration-[#d4a017] underline-offset-4" href={KORAIL_BOOK_URL} target="_blank" rel="noreferrer">
              코레일
            </a>
            에서 직접 하세요.
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
            카카오로 로그인하면 잔여석이 날 때 나에게 보내기로 알림을 받습니다. 키를 아직 안 넣었다면 로컬로 감시 화면만 먼저 쓸 수 있습니다.
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-sm">
                시작
                <input className="mt-1 w-full rounded-xl border border-[#d8d0c2] bg-white px-3 py-2" type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
              </label>
              <label className="text-sm">
                끝
                <input className="mt-1 w-full rounded-xl border border-[#d8d0c2] bg-white px-3 py-2" type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
              </label>
            </div>
            <div className="mt-5 border-t border-[#ece6da] pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">시간표 미리보기</h3>
                {selectedTrain ? (
                  <button
                    className="text-xs text-[#16324f] underline underline-offset-2"
                    onClick={() => setSelectedTrain(null)}
                    type="button"
                  >
                    전체 시간대
                  </button>
                ) : (
                  <span className="text-xs text-[#5c6570]">행을 누르면 그 편만 감시</span>
                )}
              </div>
              {timetableError ? <p className="mt-2 text-xs text-[#9a6700]">{timetableError}</p> : null}
              {trains.length === 0 && !timetableError ? (
                <p className="mt-2 text-xs text-[#5c6570]">해당 구간에 표시할 KTX가 없습니다.</p>
              ) : (
                <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
                  {trains.map((train) => {
                    const selected =
                      selectedTrain?.trainNo === train.trainNo && selectedTrain.depTime === train.depTime;
                    return (
                      <li key={`${train.trainNo}-${train.depTime}`}>
                        <button
                          className={`flex w-full justify-between rounded-lg px-3 py-1.5 text-left ${
                            selected ? "bg-[#16324f] text-white" : "bg-[#f7f3ea]"
                          }`}
                          onClick={() => toggleTrain(train)}
                          type="button"
                        >
                          <span>
                            {train.depTime} → {train.arrTime}
                          </span>
                          <span className={selected ? "text-white/80" : "text-[#5c6570]"}>
                            {train.trainName} #{train.trainNo}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="mt-3 text-xs text-[#5c6570]">
              {selectedTrain
                ? `${selectedTrain.trainName} #${selectedTrain.trainNo} (${selectedTrain.depTime})만 감시합니다. 열차 단위 조회가 막히면 해당 시간대 공개 현황으로 대체합니다.`
                : "KTX만 감시합니다. 시간표에서 열차를 고르면 그 편만 봅니다. 고르지 않으면 시간 범위 전체입니다. 1분마다 확인하고, 같은 매진→잔여 구간에서는 알림을 한 번만 보냅니다."}
            </p>
            <button className="mt-4 w-full rounded-full bg-[#c81e1e] py-3 text-sm font-bold text-white disabled:opacity-50" disabled={busy || remaining <= 0} type="submit">
              {selectedTrain ? `#${selectedTrain.trainNo} 감시 시작` : "감시 시작"}
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
                          {formatDateLabel(watch.date)} · {watch.timeStart}–{watch.timeEnd}
                          {watch.trainNo ? ` · #${watch.trainNo}` : ` · ${watch.trainType}`}
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
        공식 잔여석 API는 없습니다. 공개 열차 검색 또는 코레일 시간대 현황을 1분 간격으로만 확인하고, 코레일 계정은 저장하지 않습니다.
      </p>
    </div>
  );
}
