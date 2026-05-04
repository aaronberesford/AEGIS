import { NextResponse } from "next/server";

import { processAgentTurn } from "@/lib/agent-runtime";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      userId?: string;
      message?: string;
    };

    if (!body.workspaceId || !body.userId || !body.message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const payload = await processAgentTurn({
      workspaceId: body.workspaceId,
      userId: body.userId,
      message: body.message,
      includeSpeech: false,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
