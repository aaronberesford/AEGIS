import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { createFollowUpTask } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      title?: string;
      description?: string;
      dueAt?: string;
      leadId?: string;
      contactId?: string;
    };

    if (!body.workspaceId || !body.title || !body.description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const defaultDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const task = await createFollowUpTask({
      workspaceId: body.workspaceId,
      title: body.title,
      description: body.description,
      dueAt: body.dueAt ?? defaultDueAt,
      leadId: body.leadId,
      contactId: body.contactId,
    });

    return NextResponse.json({ task });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
