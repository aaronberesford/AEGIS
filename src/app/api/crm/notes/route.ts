import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { addCrmNote } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      leadId?: string;
      contactId?: string;
      content?: string;
    };

    if (!body.workspaceId || !body.content) {
      return NextResponse.json({ error: "workspaceId and content are required" }, { status: 400 });
    }

    await addCrmNote({
      workspaceId: body.workspaceId,
      leadId: body.leadId,
      contactId: body.contactId,
      content: body.content,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
