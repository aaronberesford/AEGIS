import { NextResponse } from "next/server";

import { addActivity, addAuditLog } from "@/lib/demo-store";
import { toErrorResponse } from "@/lib/errors";
import { sendTwilioSms } from "@/lib/services/twilio";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      to?: string;
      message?: string;
    };

    if (!body.workspaceId || !body.to || !body.message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await sendTwilioSms(body.to, body.message);

    addActivity({
      id: `activity_${Date.now()}`,
      workspaceId: body.workspaceId,
      icon: "message",
      title: `SMS queued to ${body.to}`,
      subtitle: body.message,
      timeLabel: "Just now",
    });

    addAuditLog({
      workspaceId: body.workspaceId,
      userId: "user_alex",
      action: "send_sms",
      input: body.message,
      output: JSON.stringify(result),
      approvalStatus: "approved",
    });

    return NextResponse.json({ result });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
