import { NextResponse } from "next/server";

import {
  addAuditLog,
  createAutomationFromTemplate,
  getAutomationTemplates,
} from "@/lib/repository";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  return NextResponse.json({ templates: getAutomationTemplates() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      templateKey?: string;
      enabled?: boolean;
    };

    if (!body.workspaceId || !body.templateKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const payload = await createAutomationFromTemplate({
      workspaceId: body.workspaceId,
      templateKey: body.templateKey,
      enabled: body.enabled ?? false,
    });

    await addAuditLog({
      workspaceId: body.workspaceId,
      userId: "user_alex",
      action: "create_automation_draft",
      input: body.templateKey,
      output: payload.automation.id,
      approvalStatus: payload.automation.enabled ? "not_required" : "pending",
    });

    return NextResponse.json(payload);
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
