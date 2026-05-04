import { NextResponse } from "next/server";

import {
  addAuditLog,
  createGeneratedAutomation,
  addAutomation,
} from "@/lib/demo-store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspaceId?: string;
    name?: string;
  };

  if (!body.workspaceId || !body.name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const automation = createGeneratedAutomation(body.workspaceId, body.name, "Manual trigger", [
    "Notify user",
    "Create task",
  ]);

  addAutomation(automation);
  addAuditLog({
    workspaceId: body.workspaceId,
    userId: "user_alex",
    action: "create_automation_draft",
    input: body.name,
    output: automation.id,
    approvalStatus: "pending",
  });

  return NextResponse.json({ automation });
}
