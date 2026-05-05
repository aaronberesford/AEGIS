import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ensureCronStarted } from "@/lib/cron/start";
import { getSnapshot } from "@/lib/repository";

export async function GET() {
  ensureCronStarted();
  const currentWorkspaceId = (await cookies()).get("aegis_workspace_id")?.value;
  return NextResponse.json(await getSnapshot(currentWorkspaceId));
}
