import { NextResponse } from "next/server";

import { addAuditLog, getApproval, resolveApproval, updateApproval } from "@/lib/repository";
import { executeApproval } from "@/lib/approvals";
import { toErrorResponse } from "@/lib/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      decision?: "approved" | "cancelled" | "edit";
      recipient?: string;
      message?: string;
      reason?: string;
      phone?: string;
    };

    if (!body.decision) {
      return NextResponse.json({ error: "Decision is required" }, { status: 400 });
    }

    if (body.decision === "edit") {
      const approval = await updateApproval(id, {
        recipient: body.recipient,
        message: body.message,
        reason: body.reason,
        metadata: body.phone ? { phone: body.phone } : undefined,
      });

      if (!approval) {
        return NextResponse.json({ error: "Approval not found" }, { status: 404 });
      }

      await addAuditLog({
        workspaceId: approval.workspaceId,
        userId: "user_alex",
        action: "approval_edit",
        input: approval.title,
        output: approval.recipient,
        approvalStatus: "pending",
      });

      return NextResponse.json({ approval });
    }

    if (body.decision === "cancelled") {
      const approval = await resolveApproval(id, "cancelled");

      if (!approval) {
        return NextResponse.json({ error: "Approval not found" }, { status: 404 });
      }

      await addAuditLog({
        workspaceId: approval.workspaceId,
        userId: "user_alex",
        action: "approval_cancelled",
        input: approval.title,
        output: approval.recipient,
        approvalStatus: "cancelled",
      });

      return NextResponse.json({ approval });
    }

    const approval = await getApproval(id);

    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const execution = await executeApproval(id);

    await addAuditLog({
      workspaceId: approval.workspaceId,
      userId: "user_alex",
      action: "approval_approved",
      input: approval.title,
      output: JSON.stringify(execution.execution),
      approvalStatus: "approved",
    });

    return NextResponse.json(execution);
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
