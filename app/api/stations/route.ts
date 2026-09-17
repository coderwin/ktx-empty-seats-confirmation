import { NextResponse } from "next/server";
import { STATIONS } from "@/lib/stations";

export async function GET() {
  return NextResponse.json({ stations: STATIONS });
}
