import { NextResponse } from "next/server";

import { addAuditLog, setWorkspace } from "@/lib/demo-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { workspaceId?: string };

  if (!body.workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  addAuditLog({
    workspaceId: body.workspaceId,
    userId: "user_alex",
    action: "workspace_switch",
    input: body.workspaceId,
    output: "Workspace switched",
    approvalStatus: "not_required",
  });

  return NextResponse.json(setWorkspace(body.workspaceId));
}
