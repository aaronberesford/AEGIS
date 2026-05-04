import { NextResponse } from "next/server";

import { getSnapshot } from "@/lib/demo-store";

export function GET() {
  return NextResponse.json(getSnapshot());
}
