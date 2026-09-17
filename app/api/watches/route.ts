import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { countWatches, getWatch, insertWatch, listWatches } from "@/lib/db";
import { findStation } from "@/lib/stations";
import { isPastDate } from "@/lib/kst";
import { MAX_WATCHES } from "@/lib/types";
import { checkWatch } from "@/lib/worker";

export async function GET() {
  const { user, error } = await requireUser();
  if (error || !user) return error!;
  return NextResponse.json({ watches: listWatches(user.id) });
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const body = (await request.json()) as {
    depName?: string;
    arrName?: string;
    date?: string;
    timeStart?: string;
    timeEnd?: string;
    trainNo?: string;
  };

  const dep = findStation(body.depName ?? "");
  const arr = findStation(body.arrName ?? "");
  if (!dep || !arr) {
    return NextResponse.json({ error: "출발역과 도착역을 확인하세요." }, { status: 400 });
  }
  if (dep.name === arr.name) {
    return NextResponse.json({ error: "출발역과 도착역이 같습니다." }, { status: 400 });
  }
  if (!body.date || isPastDate(body.date)) {
    return NextResponse.json({ error: "오늘 이후 날짜를 선택하세요." }, { status: 400 });
  }
  if (!body.timeStart || !body.timeEnd || body.timeStart >= body.timeEnd) {
    return NextResponse.json({ error: "시간 범위를 확인하세요." }, { status: 400 });
  }
  const trainNo = body.trainNo?.trim() || null;
  if (trainNo && !/^\d{1,8}$/.test(trainNo)) {
    return NextResponse.json({ error: "열차 번호를 확인하세요." }, { status: 400 });
  }
  if (countWatches(user.id) >= MAX_WATCHES) {
    return NextResponse.json(
      { error: `개인용 감시는 최대 ${MAX_WATCHES}개입니다.` },
      { status: 400 },
    );
  }

  const watch = insertWatch({
    userId: user.id,
    depName: dep.name,
    arrName: arr.name,
    depTagoId: dep.tagoId,
    arrTagoId: arr.tagoId,
    korailDep: dep.korailName,
    korailArr: arr.korailName,
    date: body.date,
    timeStart: body.timeStart,
    timeEnd: body.timeEnd,
    trainNo,
  });

  await checkWatch(watch);
  return NextResponse.json({ watch: getWatch(watch.id, user.id) });
}
