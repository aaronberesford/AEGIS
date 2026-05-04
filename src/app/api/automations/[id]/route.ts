import { NextResponse } from "next/server";

import { addAuditLog, toggleAutomationEnabled } from "@/lib/repository";
import { toErrorResponse } from "@/lib/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { enabled?: boolean };

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Enabled flag is required" }, { status: 400 });
    }

    const automation = await toggleAutomationEnabled(id, body.enabled);
    await addAuditLog({
      workspaceId: automation.workspaceId,
      userId: "user_alex",
      action: body.enabled ? "enable_automation" : "disable_automation",
      input: automation.name,
      output: automation.id,
      approvalStatus: "not_required",
    });

    return NextResponse.json({ automation });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
