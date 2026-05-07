import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { findWorkspaceByTwilioNumber } from "@/lib/repository";

export async function GET() {
  const settings = env();
  const twilioWorkspace = settings.twilioPhoneNumber
    ? await findWorkspaceByTwilioNumber(settings.twilioPhoneNumber)
    : null;

  return NextResponse.json(
    {
      ok: Boolean(
        settings.openAiApiKey &&
          settings.supabaseUrl &&
          settings.supabaseServiceRoleKey &&
          settings.twilioPhoneNumber,
      ),
      service: "aegis-app",
      releaseVersion: settings.releaseVersion,
      appUrl: settings.appUrl,
      twilio: {
        realtimeEnabled: settings.twilioRealtimeEnabled,
        mediaStreamUrl: settings.twilioMediaStreamUrl,
        phoneNumber: settings.twilioPhoneNumber || null,
        matchedWorkspaceId: twilioWorkspace?.id ?? null,
        matchedWorkspaceName: twilioWorkspace?.name ?? null,
      },
      base44: {
        configured: Boolean(settings.base44AppId && settings.base44ApiKey),
        workspaceId: settings.base44WorkspaceId || null,
      },
      sync: {
        configured: Boolean(settings.aegisPhoneSyncSecret),
      },
    },
    {
      headers: {
        "X-AEGIS-Release": settings.releaseVersion,
      },
    },
  );
}
