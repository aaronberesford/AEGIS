import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { addAuditLog, addToolCall } from "@/lib/repository";
import { placeTwilioCall } from "@/lib/services/twilio";
import { buildVoiceWebhookUrl } from "@/lib/voice-sales-agent";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      to?: string;
      leadId?: string;
      context?: string;
    };

    if (!body.workspaceId || !body.to) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const twimlUrl = buildVoiceWebhookUrl({
      workspaceId: body.workspaceId,
      mode: "outbound",
      leadId: body.leadId,
      contactPhone: body.to,
      outboundContext: body.context,
    });
    const result = await placeTwilioCall(body.to, twimlUrl);

    await addToolCall({
      workspaceId: body.workspaceId,
      tool: "place_call",
      status: "success",
      input: body.to,
      output: JSON.stringify(result),
    });

    await addAuditLog({
      workspaceId: body.workspaceId,
      userId: "user_alex",
      action: "place_call",
      input: body.to,
      output: JSON.stringify(result),
      approvalStatus: "approved",
    });

    return NextResponse.json({ result });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
