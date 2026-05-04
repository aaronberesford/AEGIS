import { NextResponse } from "next/server";

import { addActivity, addAuditLog } from "@/lib/demo-store";
import { env } from "@/lib/env";
import { toErrorResponse } from "@/lib/errors";
import { placeTwilioCall } from "@/lib/services/twilio";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      to?: string;
    };

    if (!body.workspaceId || !body.to) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const twimlUrl = `${env().appUrl}/api/twilio/voice-script`;
    const result = await placeTwilioCall(body.to, twimlUrl);

    addActivity({
      id: `activity_${Date.now()}`,
      workspaceId: body.workspaceId,
      icon: "phone",
      title: `Outbound call queued`,
      subtitle: body.to,
      timeLabel: "Just now",
    });

    addAuditLog({
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
