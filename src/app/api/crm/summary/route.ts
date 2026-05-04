import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { summarizeRecentCrmActivity } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const summary = await summarizeRecentCrmActivity(workspaceId);
    return NextResponse.json({ summary });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
