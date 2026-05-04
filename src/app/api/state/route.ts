import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getSnapshot } from "@/lib/repository";

export async function GET() {
  const currentWorkspaceId = (await cookies()).get("aegis_workspace_id")?.value;
  return NextResponse.json(await getSnapshot(currentWorkspaceId));
}
