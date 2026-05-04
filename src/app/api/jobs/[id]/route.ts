import { NextResponse } from "next/server";

import { addAuditLog, toggleScheduledJobEnabled } from "@/lib/repository";
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

    const job = await toggleScheduledJobEnabled(id, body.enabled);
    if (!job) {
      return NextResponse.json({ error: "Scheduled job not found" }, { status: 404 });
    }
    await addAuditLog({
      workspaceId: job.workspaceId,
      userId: "user_alex",
      action: body.enabled ? "enable_scheduled_job" : "disable_scheduled_job",
      input: job.name,
      output: job.id,
      approvalStatus: "not_required",
    });

    return NextResponse.json({ job });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
