import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findStation } from "@/lib/stations";
import { boardFromSnapshot, fetchRemainderSnapshot } from "@/lib/remainder";

export async function GET(request: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const dep = findStation(request.nextUrl.searchParams.get("dep") ?? "");
  const arr = findStation(request.nextUrl.searchParams.get("arr") ?? "");
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!dep || !arr || !date) {
    return NextResponse.json({ error: "출발역, 도착역, 날짜가 필요합니다." }, { status: 400 });
  }

  try {
    const snapshot = await fetchRemainderSnapshot();
    const board = boardFromSnapshot(snapshot, {
      dep: dep.korailName,
      arr: arr.korailName,
      date,
    });
    if ("error" in board && board.error) {
      return NextResponse.json({ error: board.error }, { status: 400 });
    }
    return NextResponse.json(board);
  } catch (err) {
    const message = err instanceof Error ? err.message : "공개 현황을 가져오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
