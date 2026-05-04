import { NextResponse } from "next/server";

import { runDueScheduledJobs } from "@/lib/repository";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      limit?: number;
    };

    const result = await runDueScheduledJobs({
      workspaceId: body.workspaceId,
      limit: body.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
