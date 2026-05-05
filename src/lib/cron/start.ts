import "server-only";

import cron from "node-cron";

import {
  runDailySummary,
  runDeepWorkspaceScan,
  runWorkspaceChecks,
} from "@/lib/cron/runner";

declare global {
  var __aegisCronStarted: boolean | undefined;
}

export function ensureCronStarted() {
  if (globalThis.__aegisCronStarted) {
    return;
  }

  globalThis.__aegisCronStarted = true;

  cron.schedule(
    "0 */2 * * *",
    () => {
      void runWorkspaceChecks();
    },
    { timezone: "Europe/London" },
  );

  cron.schedule(
    "0 */6 * * *",
    () => {
      void runDeepWorkspaceScan();
    },
    { timezone: "Europe/London" },
  );

  cron.schedule(
    "0 8 * * *",
    () => {
      void runDailySummary();
    },
    { timezone: "Europe/London" },
  );

  console.log("[AEGIS cron] Background scheduler started.");
}
