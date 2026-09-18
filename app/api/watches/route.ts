import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { countWatches, getWatch, insertWatch, listWatches } from "@/lib/db";
import { findStation } from "@/lib/stations";
import { isPastDate } from "@/lib/kst";
import { MAX_WATCHES } from "@/lib/types";
import { parseSlotIds, watchRoute } from "@/lib/remainder";
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
    slotIds?: string[];
  };

  const dep = findStation(body.depName ?? "");
  const arr = findStation(body.arrName ?? "");
  if (!dep || !arr) {
    return NextResponse.json({ error: "출발역과 도착역을 확인하세요." }, { status: 400 });
  }
  if (dep.name === arr.name) {
    return NextResponse.json({ error: "출발역과 도착역이 같습니다." }, { status: 400 });
  }
  if (!watchRoute(dep.korailName, arr.korailName)) {
    return NextResponse.json(
      { error: "이 구간은 공개 잔여석 현황 노선과 맞지 않습니다." },
      { status: 400 },
    );
  }
  if (!body.date || isPastDate(body.date)) {
    return NextResponse.json({ error: "오늘 이후 날짜를 선택하세요." }, { status: 400 });
  }
  const slotIds = parseSlotIds((body.slotIds ?? []).join(","));
  if (slotIds.length === 0) {
    return NextResponse.json({ error: "감시할 시간칸을 선택하세요." }, { status: 400 });
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
    slotIds,
  });

  await checkWatch(watch);
  return NextResponse.json({ watch: getWatch(watch.id, user.id) });
}
