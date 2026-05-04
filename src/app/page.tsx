import { getSnapshot } from "@/lib/demo-store";
import { AegisApp } from "@/components/aegis-app";

export const dynamic = "force-dynamic";

export default function Home() {
  const snapshot = getSnapshot();

  return <AegisApp initialSnapshot={snapshot} />;
}
