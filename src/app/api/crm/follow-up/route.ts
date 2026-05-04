import { NextResponse } from "next/server";

import { scheduleLeadFollowUp } from "@/lib/repository";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      leadId?: string;
      dueAt?: string;
      title?: string;
      description?: string;
    };

    if (!body.workspaceId || !body.leadId || !body.dueAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const payload = await scheduleLeadFollowUp({
      workspaceId: body.workspaceId,
      leadId: body.leadId,
      dueAt: body.dueAt,
      title: body.title,
      description: body.description,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
