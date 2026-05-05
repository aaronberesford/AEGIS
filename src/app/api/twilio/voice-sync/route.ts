import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { AppError, toErrorResponse } from "@/lib/errors";
import {
  addAuditLog,
  addCrmNote,
  createFollowUpTask,
  createLeadRecord,
  findLeadByPhone,
  logCallActivity,
  updateLeadStatus,
  workspaceById,
} from "@/lib/repository";
import {
  findBase44CustomerByPhone,
  upsertBase44CustomerFromCall,
} from "@/lib/services/base44";
import { extractPhoneCallOutcome } from "@/lib/services/openai";

type VoiceSyncPayload = {
  workspaceId?: string;
  callSid?: string;
  phoneNumber?: string;
  direction?: "inbound" | "outbound";
  transcript?: string;
  knownCustomerId?: string | null;
};

function requireVoiceSyncAuth(request: Request) {
  const secret = env().aegisPhoneSyncSecret;
  if (!secret) {
    throw new AppError("AEGIS phone sync secret is not configured.", {
      code: "VOICE_SYNC_SECRET_MISSING",
      status: 500,
    });
  }

  const header = request.headers.get("x-aegis-sync-secret");
  if (header !== secret) {
    throw new AppError("Unauthorized voice sync request.", {
      code: "VOICE_SYNC_UNAUTHORIZED",
      status: 401,
    });
  }
}

function buildCustomerContext(input: {
  customer:
    | {
        name: string;
        company: string | null;
        email: string | null;
        phone: string | null;
        notes: string | null;
        type: string | null;
      }
    | null;
  lead:
    | {
        name: string;
        company: string;
        email: string;
        stage: string;
        notes: string;
      }
    | null;
}) {
  const lines = [
    input.customer?.name ? `Base44 customer: ${input.customer.name}` : null,
    input.customer?.company ? `Company: ${input.customer.company}` : null,
    input.customer?.email ? `Email: ${input.customer.email}` : null,
    input.customer?.type ? `Type: ${input.customer.type}` : null,
    input.customer?.notes ? `History notes: ${input.customer.notes}` : null,
    input.lead?.name ? `AEGIS lead: ${input.lead.name}` : null,
    input.lead?.company ? `Lead company: ${input.lead.company}` : null,
    input.lead?.stage ? `Lead stage: ${input.lead.stage}` : null,
    input.lead?.notes ? `Lead notes: ${input.lead.notes}` : null,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : null;
}

function fallbackLeadName(phoneNumber: string) {
  const digits = phoneNumber.replace(/[^\d]/g, "");
  const suffix = digits.slice(-4) || "caller";
  return `Phone caller ${suffix}`;
}

function resolveFollowUpDate(callbackTiming?: string | null) {
  if (!callbackTiming?.trim()) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(9, 0, 0, 0);
    return fallback.toISOString();
  }

  const normalized = callbackTiming.trim().toLowerCase();
  const now = new Date();

  if (normalized.includes("today")) {
    const today = new Date();
    today.setHours(Math.max(today.getHours() + 2, 15), 0, 0, 0);
    return today.toISOString();
  }

  if (normalized.includes("tomorrow")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow.toISOString();
  }

  if (normalized.includes("next week")) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek.toISOString();
  }

  const parsed = new Date(callbackTiming);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  now.setDate(now.getDate() + 2);
  now.setHours(9, 0, 0, 0);
  return now.toISOString();
}

export async function POST(request: Request) {
  try {
    requireVoiceSyncAuth(request);

    const body = (await request.json()) as VoiceSyncPayload;
    if (!body.workspaceId || !body.phoneNumber || !body.transcript?.trim()) {
      return NextResponse.json(
        { error: "workspaceId, phoneNumber and transcript are required" },
        { status: 400 },
      );
    }

    const workspace = await workspaceById(body.workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const existingLead = await findLeadByPhone(body.workspaceId, body.phoneNumber);
    const base44Customer = await findBase44CustomerByPhone(workspace, body.phoneNumber);
    const customerContext = buildCustomerContext({
      customer: base44Customer,
      lead: existingLead
        ? {
            name: existingLead.name,
            company: existingLead.company,
            email: existingLead.email,
            stage: existingLead.stage,
            notes: existingLead.notes,
          }
        : null,
    });

    const outcome = await extractPhoneCallOutcome({
      workspace,
      phoneNumber: body.phoneNumber,
      direction: body.direction ?? "inbound",
      transcript: body.transcript,
      existingCustomerContext: customerContext,
    });

    const leadName =
      outcome.callerName?.trim() ||
      base44Customer?.name ||
      existingLead?.name ||
      fallbackLeadName(body.phoneNumber);
    const leadCompany =
      outcome.company?.trim() || base44Customer?.company || existingLead?.company || "Unassigned";
    const leadEmail =
      outcome.email?.trim() || base44Customer?.email || existingLead?.email || "";
    const needsFollowUp =
      outcome.requestedCallback || (!outcome.purchaseCompleted && outcome.intent !== "unknown");

    const syncedCustomer = await upsertBase44CustomerFromCall(workspace, {
      existingCustomerId: body.knownCustomerId ?? base44Customer?.id ?? null,
      phoneNumber: body.phoneNumber,
      name: leadName,
      company: leadCompany === "Unassigned" ? "" : leadCompany,
      email: leadEmail,
      type: outcome.purchaseCompleted ? "Customer" : "Lead",
      historyNote: outcome.customerHistoryNote,
    });

    let lead = existingLead;
    if (!lead && (outcome.shouldCreateLead || needsFollowUp)) {
      lead = await createLeadRecord({
        workspaceId: body.workspaceId,
        name: leadName,
        phone: body.phoneNumber,
        email: leadEmail,
        source: `Phone ${body.direction ?? "inbound"}`,
        status: outcome.leadStatus,
        company: leadCompany === "Unassigned" ? undefined : leadCompany,
        nextFollowUpAt:
          needsFollowUp ? resolveFollowUpDate(outcome.callbackTiming) : undefined,
      });
    } else if (lead) {
      await updateLeadStatus({
        workspaceId: body.workspaceId,
        leadId: lead.id,
        status: outcome.leadStatus,
        nextFollowUpAt: needsFollowUp ? resolveFollowUpDate(outcome.callbackTiming) : undefined,
      });
    }

    if (lead) {
      await addCrmNote({
        workspaceId: body.workspaceId,
        leadId: lead.id,
        content: `${outcome.summary}\n\nRequirements: ${outcome.requirementsSummary}\n\nTranscript:\n${body.transcript}`,
      });
    }

    if (lead && needsFollowUp) {
      await createFollowUpTask({
        workspaceId: body.workspaceId,
        leadId: lead.id,
        title: `Call back ${lead.name}`,
        description: outcome.nextAction,
        dueAt: resolveFollowUpDate(outcome.callbackTiming),
      });
    }

    await logCallActivity({
      workspaceId: body.workspaceId,
      leadId: lead?.id,
      direction: body.direction ?? "inbound",
      status: outcome.purchaseCompleted ? "completed" : "follow_up_required",
      summary: outcome.summary,
      outcome: body.callSid || undefined,
      transcript: body.transcript,
      nextAction: outcome.nextAction,
    });

    await addAuditLog({
      workspaceId: body.workspaceId,
      userId: "user_alex",
      action: "voice_call_sync",
      input: body.phoneNumber,
      output: JSON.stringify({
        summary: outcome.summary,
        intent: outcome.intent,
        customerId: syncedCustomer?.id ?? null,
        leadId: lead?.id ?? null,
      }),
      approvalStatus: "not_required",
    });

    return NextResponse.json({
      ok: true,
      outcome,
      customerId: syncedCustomer?.id ?? null,
      leadId: lead?.id ?? null,
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
