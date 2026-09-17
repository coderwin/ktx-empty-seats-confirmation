import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findStation } from "@/lib/stations";
import { fetchTimetable } from "@/lib/tago";

export async function GET(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const { searchParams } = request.nextUrl;
  const dep = findStation(searchParams.get("dep") ?? "");
  const arr = findStation(searchParams.get("arr") ?? "");
  const date = searchParams.get("date") ?? "";
  const timeStart = searchParams.get("timeStart") ?? "00:00";
  const timeEnd = searchParams.get("timeEnd") ?? "23:59";

  if (!dep || !arr || !date) {
    return NextResponse.json({ error: "출발역, 도착역, 날짜가 필요합니다." }, { status: 400 });
  }

  const result = await fetchTimetable({
    depTagoId: dep.tagoId,
    arrTagoId: arr.tagoId,
    date,
    timeStart,
    timeEnd,
  });
  return NextResponse.json(result);
}
