import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { AppError, toErrorResponse } from "@/lib/errors";
import {
  addAuditLog,
  addCrmNote,
  createGeneratedApproval,
  createLeadRecord,
  findLeadByPhone,
  logCallActivity,
  previewAgentAction,
  scheduleLeadFollowUp,
  updateLeadStatus,
  workspaceById,
} from "@/lib/repository";
import {
  buildBase44ForkliftCustomerSummary,
  buildBase44ForkliftListingLink,
  findBase44ForkliftByReference,
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

function parsePriceDisplay(value?: string | null) {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function purchaseDecisionStatus(input: {
  leadStatus: string;
  purchaseIntent: "ready_now" | "considering" | "not_buying" | "unknown";
  purchaseCompleted: boolean;
}) {
  if (input.purchaseCompleted) {
    return "Won";
  }

  if (input.purchaseIntent === "ready_now") {
    return "Purchase ready";
  }

  return input.leadStatus;
}

function buildTruckLinkLabel(link: string | null, listingId: string | null) {
  if (link) {
    return link;
  }

  if (listingId) {
    return `Truck reference: ${listingId}`;
  }

  return "Truck link to be confirmed by the sales team.";
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

    const matchedForklift =
      outcome.intent === "buy"
        ? await findBase44ForkliftByReference(workspace, {
            listingId: outcome.selectedListingId,
            title: outcome.selectedTruckTitle,
            query: `${outcome.selectedListingId ?? ""} ${outcome.selectedTruckTitle ?? ""}`.trim(),
          })
        : null;
    const leadName =
      outcome.callerName?.trim() ||
      base44Customer?.name ||
      existingLead?.name ||
      fallbackLeadName(body.phoneNumber);
    const leadCompany =
      outcome.company?.trim() || base44Customer?.company || existingLead?.company || "Unassigned";
    const leadEmail =
      outcome.email?.trim() || base44Customer?.email || existingLead?.email || "";
    const resolvedLeadStatus = purchaseDecisionStatus({
      leadStatus: outcome.leadStatus,
      purchaseIntent: outcome.purchaseIntent,
      purchaseCompleted: outcome.purchaseCompleted,
    });
    const needsPaymentFollowUp =
      outcome.purchaseIntent === "ready_now" && !outcome.purchaseCompleted;
    const needsGeneralFollowUp =
      outcome.requestedCallback ||
      (!needsPaymentFollowUp &&
        !outcome.purchaseCompleted &&
        outcome.intent !== "unknown");

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
    if (!lead && (outcome.shouldCreateLead || needsGeneralFollowUp || needsPaymentFollowUp)) {
      lead = await createLeadRecord({
        workspaceId: body.workspaceId,
        name: leadName,
        phone: body.phoneNumber,
        email: leadEmail,
        source: `Phone ${body.direction ?? "inbound"}`,
        status: resolvedLeadStatus,
        company: leadCompany === "Unassigned" ? undefined : leadCompany,
        estimatedValue: matchedForklift
          ? parsePriceDisplay(matchedForklift.priceDisplay)
          : undefined,
        nextFollowUpAt:
          needsGeneralFollowUp || needsPaymentFollowUp
            ? resolveFollowUpDate(outcome.callbackTiming)
            : undefined,
      });
    } else if (lead) {
      await updateLeadStatus({
        workspaceId: body.workspaceId,
        leadId: lead.id,
        status: resolvedLeadStatus,
        nextFollowUpAt:
          needsGeneralFollowUp || needsPaymentFollowUp
            ? resolveFollowUpDate(outcome.callbackTiming)
            : undefined,
      });
    }

    if (lead) {
      const truckSummary = matchedForklift
        ? `Truck: ${buildBase44ForkliftCustomerSummary(matchedForklift)}`
        : null;
      await addCrmNote({
        workspaceId: body.workspaceId,
        leadId: lead.id,
        content: [
          outcome.summary,
          `Requirements: ${outcome.requirementsSummary}`,
          truckSummary,
          outcome.purchaseIntent === "ready_now"
            ? `Purchase details: ${outcome.buyerType ?? "unknown"} purchase, delivery postcode ${outcome.deliveryPostcode ?? "not captured"}.`
            : null,
          `Transcript:\n${body.transcript}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
    }

    if (lead && needsGeneralFollowUp) {
      await scheduleLeadFollowUp({
        workspaceId: body.workspaceId,
        leadId: lead.id,
        title: `Call back ${lead.name}`,
        description: outcome.nextAction,
        dueAt: resolveFollowUpDate(outcome.callbackTiming),
      });
    }

    if (lead && needsPaymentFollowUp) {
      const truckLink = matchedForklift
        ? buildBase44ForkliftListingLink(matchedForklift)
        : null;
      const linkLabel = buildTruckLinkLabel(truckLink, matchedForklift?.listingId ?? null);
      const shouldSendPurchaseSummary =
        outcome.wantsPurchaseSummary || outcome.purchaseIntent === "ready_now";
      const shouldSendInvoiceLink =
        outcome.wantsInvoiceLink || outcome.purchaseIntent === "ready_now";
      const buyerTypeLabel =
        outcome.buyerType && outcome.buyerType !== "unknown"
          ? outcome.buyerType
          : "business";
      const truckName =
        matchedForklift?.title || outcome.selectedTruckTitle || "the requested truck";
      const priceLabel = matchedForklift?.priceDisplay || "price to confirm";
      const deliveryPostcode = outcome.deliveryPostcode?.trim() || "not captured";
      const purchaseSummaryBody = [
        `Hi ${lead.name},`,
        "",
        `Thanks for speaking with AEGIS about ${truckName}.`,
        `Truck reference: ${matchedForklift?.listingId ?? outcome.selectedListingId ?? "to confirm"}.`,
        `Quoted price: ${priceLabel}.`,
        `Purchase type: ${buyerTypeLabel}.`,
        `Delivery postcode: ${deliveryPostcode}.`,
        `Truck link: ${linkLabel}`,
        "",
        "We have logged your order interest and can now send the invoice or payment link once approved.",
        "",
        `Call summary: ${outcome.summary}`,
      ].join("\n");
      const invoiceFollowUpBody = [
        `Hi ${lead.name},`,
        "",
        `We are preparing the invoice and payment link for ${truckName}.`,
        `Truck reference: ${matchedForklift?.listingId ?? outcome.selectedListingId ?? "to confirm"}.`,
        `Quoted price: ${priceLabel}.`,
        "",
        "Once payment is approved, our team will confirm the order and next delivery steps.",
      ].join("\n");
      const smsBody = [
        `AEGIS: thanks for your interest in ${truckName}.`,
        matchedForklift?.listingId ? `Ref ${matchedForklift.listingId}.` : null,
        truckLink ? `Link: ${truckLink}` : null,
        `Quoted ${priceLabel}.`,
        "We'll send the purchase summary and payment steps shortly.",
      ]
        .filter(Boolean)
        .join(" ");

      if (leadEmail && shouldSendPurchaseSummary) {
        await previewAgentAction({
          message: "",
          actionCards: [],
          pendingApproval: createGeneratedApproval(
            body.workspaceId,
            `Send purchase summary to ${lead.name}`,
            leadEmail,
            purchaseSummaryBody,
            `Phone buyer is ready to move forward with ${truckName}.`,
            "high",
            "send_email",
            {
              leadId: lead.id,
              email: leadEmail,
              listingId:
                matchedForklift?.listingId ?? outcome.selectedListingId ?? "",
              truckTitle: truckName,
              truckLink: truckLink ?? matchedForklift?.urlPath ?? "",
              category: "purchase_summary",
            },
          ),
        });
      }

      if (leadEmail && shouldSendInvoiceLink) {
        await previewAgentAction({
          message: "",
          actionCards: [],
          pendingApproval: createGeneratedApproval(
            body.workspaceId,
            `Send invoice and payment link to ${lead.name}`,
            leadEmail,
            invoiceFollowUpBody,
            `Buyer asked to proceed with ${truckName}; invoice or payment link should be sent after approval.`,
            "high",
            "send_email",
            {
              leadId: lead.id,
              email: leadEmail,
              listingId:
                matchedForklift?.listingId ?? outcome.selectedListingId ?? "",
              truckTitle: truckName,
              truckLink: truckLink ?? matchedForklift?.urlPath ?? "",
              category: "invoice_payment",
            },
          ),
        });
      }

      if (shouldSendPurchaseSummary) {
        await previewAgentAction({
          message: "",
          actionCards: [],
          pendingApproval: createGeneratedApproval(
            body.workspaceId,
            `Text truck details to ${lead.name}`,
            lead.name,
            smsBody,
            `Phone buyer is ready to move forward with ${truckName}.`,
            "medium",
            "send_sms",
            {
              leadId: lead.id,
              phone: body.phoneNumber,
              listingId:
                matchedForklift?.listingId ?? outcome.selectedListingId ?? "",
              truckTitle: truckName,
              truckLink: truckLink ?? matchedForklift?.urlPath ?? "",
              category: "purchase_summary_sms",
            },
          ),
        });
      }

      await scheduleLeadFollowUp({
        workspaceId: body.workspaceId,
        leadId: lead.id,
        title: `Check payment status for ${lead.name}`,
        description:
          outcome.nextAction ||
          `Follow up ${lead.name} if payment has not been received for ${truckName}.`,
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
        purchaseIntent: outcome.purchaseIntent,
        selectedListingId: matchedForklift?.listingId ?? outcome.selectedListingId ?? null,
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
