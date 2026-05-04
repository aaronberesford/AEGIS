import { cookies } from "next/headers";

import { getSnapshot } from "@/lib/repository";
import { AegisApp } from "@/components/aegis-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentWorkspaceId = (await cookies()).get("aegis_workspace_id")?.value;
  const snapshot = await getSnapshot(currentWorkspaceId);

  return <AegisApp initialSnapshot={snapshot} />;
}
