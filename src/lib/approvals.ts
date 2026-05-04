import "server-only";

import {
  getApproval,
  markApprovalError,
  resolveApproval,
  workspaceById,
} from "@/lib/demo-store";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { placeTwilioCall, sendTwilioSms } from "@/lib/services/twilio";

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
  const approval = getApproval(approvalId);

  if (!approval) {
    throw new AppError("Approval not found.", {
      code: "APPROVAL_NOT_FOUND",
      status: 404,
    });
  }

  if (approval.type === "send_sms") {
    try {
      const phone = approval.metadata?.phone;
      if (!phone) {
        throw new AppError("SMS approval is missing a destination phone number.", {
          code: "SMS_MISSING_PHONE",
          status: 400,
        });
      }

      const result = await sendTwilioSms(phone, approval.message);
      resolveApproval(approvalId, "approved");
      return { approval, execution: result };
    } catch (error) {
      markApprovalError(
        approvalId,
        error instanceof Error ? error.message : "SMS execution failed.",
      );
      throw error;
    }
  }

  if (approval.type === "make_call") {
    try {
      const workspace = workspaceById(approval.workspaceId);
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

      const phone = approval.metadata?.phone;
      if (!phone) {
        throw new AppError("Call approval is missing a destination phone number.", {
          code: "CALL_MISSING_PHONE",
          status: 400,
        });
      }

      const script = encodeURIComponent(approval.message);
      const twimlUrl = `${env().appUrl}/api/twilio/voice-script?script=${script}`;
      const result = await placeTwilioCall(phone, twimlUrl);
      resolveApproval(approvalId, "approved");
      return { approval, execution: result };
    } catch (error) {
      markApprovalError(
        approvalId,
        error instanceof Error ? error.message : "Call execution failed.",
      );
      throw error;
    }
  }

  markApprovalError(
    approvalId,
    "This approval type is not executable yet in Phase 2.",
  );
  throw new AppError("This approval type is not executable yet.", {
    code: "APPROVAL_NOT_EXECUTABLE",
    status: 400,
  });
}
