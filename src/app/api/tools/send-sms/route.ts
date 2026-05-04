import { NextResponse } from "next/server";

import { addAuditLog, addToolCall } from "@/lib/repository";
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

    await addToolCall({
      workspaceId: body.workspaceId,
      tool: "send_sms",
      status: "success",
      input: JSON.stringify({
        recipient: body.to,
        to: body.to,
        message: body.message,
      }),
      output: JSON.stringify(result),
    });

    await addAuditLog({
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
