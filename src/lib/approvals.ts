import "server-only";

import {
  addToolCall,
  getApproval,
  logCallActivity,
  logSmsActivity,
  markApprovalError,
  resolveApproval,
  workspaceById,
} from "@/lib/repository";
import { AppError } from "@/lib/errors";
import { placeTwilioCall, sendTwilioSms } from "@/lib/services/twilio";
import { buildVoiceWebhookUrl } from "@/lib/voice-sales-agent";

function isWithinBusinessHours(value: string) {
  const match = value.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
  if (!match) {
    return true;
  }

  const [, startHour, startMinute, endHour, endMinute] = match;
  const now = new Date();
  const total = now.getHours() * 60 + now.getMinutes();
  const start = Number(startHour) * 60 + Number(startMinute);
  const end = Number(endHour) * 60 + Number(endMinute);
  return total >= start && total <= end;
}

export async function executeApproval(approvalId: string) {
  const approval = await getApproval(approvalId);

  if (!approval) {
    throw new AppError("Approval not found.", {
      code: "APPROVAL_NOT_FOUND",
      status: 404,
    });
  }

  if (approval.type === "send_sms") {
    const phone = approval.metadata?.phone;
    try {
      if (!phone) {
        throw new AppError("SMS approval is missing a destination phone number.", {
          code: "SMS_MISSING_PHONE",
          status: 400,
        });
      }

      const result = await sendTwilioSms(phone, approval.message);
      await addToolCall({
        workspaceId: approval.workspaceId,
        tool: "send_sms",
        status: "success",
        input: JSON.stringify({
          recipient: approval.recipient,
          to: phone,
          message: approval.message,
        }),
        output: JSON.stringify(result),
      });
      await logSmsActivity({
        workspaceId: approval.workspaceId,
        leadId: approval.metadata?.leadId,
        direction: "outbound",
        messageBody: approval.message,
        providerMessageId:
          result && typeof result === "object" && "sid" in result
            ? String(result.sid)
            : undefined,
      });
      await resolveApproval(approvalId, "approved");
      return { approval, execution: result };
    } catch (error) {
      await addToolCall({
        workspaceId: approval.workspaceId,
        tool: "send_sms",
        status: "error",
        input: JSON.stringify({
          recipient: approval.recipient,
          to: phone,
          message: approval.message,
        }),
        output: "",
        error: error instanceof Error ? error.message : "SMS execution failed.",
      });
      await markApprovalError(
        approvalId,
        error instanceof Error ? error.message : "SMS execution failed.",
      );
      throw error;
    }
  }

  if (approval.type === "make_call") {
    const phone = approval.metadata?.phone;
    try {
      const workspace = await workspaceById(approval.workspaceId);
      if (!workspace) {
        throw new AppError("Workspace not found for this approval.", {
          code: "WORKSPACE_NOT_FOUND",
          status: 404,
        });
      }

      if (!isWithinBusinessHours(workspace.businessHours)) {
        throw new AppError("Calls are blocked outside configured business hours.", {
          code: "CALL_OUTSIDE_BUSINESS_HOURS",
          status: 400,
        });
      }

      if (!phone) {
        throw new AppError("Call approval is missing a destination phone number.", {
          code: "CALL_MISSING_PHONE",
          status: 400,
        });
      }

      const twimlUrl = buildVoiceWebhookUrl({
        workspaceId: approval.workspaceId,
        mode: "outbound",
        leadId: approval.metadata?.leadId,
        contactPhone: phone,
        outboundContext: approval.message,
      });
      const result = await placeTwilioCall(phone, twimlUrl);
      await addToolCall({
        workspaceId: approval.workspaceId,
        tool: "place_call",
        status: "success",
        input: JSON.stringify({
          recipient: approval.recipient,
          to: phone,
          message: approval.message,
        }),
        output: JSON.stringify(result),
      });
      await logCallActivity({
        workspaceId: approval.workspaceId,
        leadId: approval.metadata?.leadId,
        status: "queued",
        summary: approval.message,
        outcome:
          result && typeof result === "object" && "sid" in result
            ? String(result.sid)
            : undefined,
      });
      await resolveApproval(approvalId, "approved");
      return { approval, execution: result };
    } catch (error) {
      await addToolCall({
        workspaceId: approval.workspaceId,
        tool: "place_call",
        status: "error",
        input: JSON.stringify({
          recipient: approval.recipient,
          to: phone,
          message: approval.message,
        }),
        output: "",
        error: error instanceof Error ? error.message : "Call execution failed.",
      });
      await markApprovalError(
        approvalId,
        error instanceof Error ? error.message : "Call execution failed.",
      );
      throw error;
    }
  }

  await markApprovalError(
    approvalId,
    "This approval type is not executable yet in Phase 2.",
  );
  throw new AppError("This approval type is not executable yet.", {
    code: "APPROVAL_NOT_EXECUTABLE",
    status: 400,
  });
}
