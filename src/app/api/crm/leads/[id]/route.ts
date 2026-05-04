import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { updateLeadStatus } from "@/lib/repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      workspaceId?: string;
      status?: string;
      nextFollowUpAt?: string;
    };

    if (!body.workspaceId || !body.status) {
      return NextResponse.json({ error: "workspaceId and status are required" }, { status: 400 });
    }

    const lead = await updateLeadStatus({
      workspaceId: body.workspaceId,
      leadId: id,
      status: body.status,
      nextFollowUpAt: body.nextFollowUpAt,
    });

    return NextResponse.json({ lead });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
