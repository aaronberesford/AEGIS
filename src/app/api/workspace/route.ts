import { NextResponse } from "next/server";

import { cookies } from "next/headers";

import { addAuditLog, getSnapshot } from "@/lib/repository";

export async function POST(request: Request) {
  const body = (await request.json()) as { workspaceId?: string };

  if (!body.workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  await addAuditLog({
    workspaceId: body.workspaceId,
    userId: "user_alex",
    action: "workspace_switch",
    input: body.workspaceId,
    output: "Workspace switched",
    approvalStatus: "not_required",
  });

  (await cookies()).set("aegis_workspace_id", body.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json(await getSnapshot(body.workspaceId));
}
