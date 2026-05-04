import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { upsertIntegrationSetting } from "@/lib/repository";
import { testOpenAiConnection } from "@/lib/services/openai";
import { testTwilioConnection } from "@/lib/services/twilio";

export async function POST(request: Request) {
  let provider: "openai" | "twilio" | undefined;
  let workspaceId: string | undefined;
  try {
    const body = (await request.json()) as {
      provider?: "openai" | "twilio";
      workspaceId?: string;
    };
    provider = body.provider;
    workspaceId = body.workspaceId;

    if (!body.provider || !body.workspaceId) {
      return NextResponse.json(
        { error: "Provider and workspaceId are required" },
        { status: 400 },
      );
    }

    const result =
      body.provider === "openai"
        ? await testOpenAiConnection()
        : await testTwilioConnection();

    await upsertIntegrationSetting({
      workspaceId: body.workspaceId,
      provider: body.provider,
      kind: body.provider === "openai" ? "ai" : "telephony",
      status: "connected",
      config: {
        lastTestResult: result.detail,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (provider && workspaceId) {
      try {
        await upsertIntegrationSetting({
          workspaceId,
          provider,
          kind: provider === "openai" ? "ai" : "telephony",
          status: "error",
          config: {
            lastError: error instanceof Error ? error.message : "Connection test failed.",
          },
        });
      } catch {
        // Ignore secondary persistence failures during error handling.
      }
    }
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
