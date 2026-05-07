import twilio from "twilio";

import { env } from "@/lib/env";
import { AppError, toErrorResponse } from "@/lib/errors";
import {
  addAuditLog,
  addCrmNote,
  findLeadByPhone,
  findWorkspaceByTwilioNumber,
  logCallActivity,
  workspaceById,
} from "@/lib/repository";
import {
  buildVoiceAudioUrl,
  createVoiceSession,
  decodeVoiceState,
  encodeVoiceState,
  generateVoiceDecision,
  nextState,
  noInputDecision,
  openingLine,
  utteranceFromTwilio,
  type VoiceSessionState,
} from "@/lib/voice-sales-agent";

const { VoiceResponse } = twilio.twiml;

function xmlResponse(twiml: InstanceType<typeof VoiceResponse>) {
  return new Response(twiml.toString(), {
    headers: {
      "Content-Type": "text/xml",
      "X-AEGIS-Release": env().releaseVersion,
    },
  });
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function realtimeStreamResponse(input: {
  workspaceId: string;
  workspaceName: string;
  leadId?: string;
  contactPhone?: string;
  mode: "inbound" | "outbound";
  outboundContext?: string;
}) {
  const params = [
    ["workspaceId", input.workspaceId],
    ["workspaceName", input.workspaceName],
    ["mode", input.mode],
    ["leadId", input.leadId ?? ""],
    ["contactPhone", input.contactPhone ?? ""],
    ["outboundContext", input.outboundContext ?? ""],
  ]
    .filter(([, value]) => value)
    .map(
      ([name, value]) =>
        `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}" />`,
    )
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapeXml(
      env().twilioMediaStreamUrl,
    )}">${params}</Stream></Connect></Response>`,
    {
      headers: {
        "Content-Type": "text/xml",
        "X-AEGIS-Release": env().releaseVersion,
      },
    },
  );
}

function actionUrl(state: VoiceSessionState) {
  return `${env().appUrl}/api/twilio/voice-script?state=${encodeURIComponent(
    encodeVoiceState(state),
  )}`;
}

function gatherReply(state: VoiceSessionState, message: string) {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: ["speech", "dtmf"],
    numDigits: 1,
    action: actionUrl(state),
    method: "POST",
    speechTimeout: "auto",
    timeout: 1,
    hints:
      "buy,sell,forklift,electric,diesel,LPG,Toyota,Linde,Hyster,Doosan,Jungheinrich,model,capacity,mast",
    actionOnEmptyResult: true,
  });

  if (env().demoMode) {
    gather.say({ voice: "alice" }, message);
  } else {
    gather.play(buildVoiceAudioUrl({ workspaceId: state.workspaceId, text: message }));
  }
  return xmlResponse(twiml);
}

function sayAndHangup(workspaceId: string, message: string) {
  const twiml = new VoiceResponse();

  if (env().demoMode) {
    twiml.say({ voice: "alice" }, message);
  } else {
    twiml.play(buildVoiceAudioUrl({ workspaceId, text: message }));
  }

  twiml.hangup();
  return xmlResponse(twiml);
}

function directionMode(value: string) {
  return value.startsWith("inbound") ? "inbound" : "outbound";
}

async function finalizeCall(input: {
  workspaceId: string;
  leadId?: string;
  callSid?: string;
  contactPhone?: string;
  summary: string;
  direction: "inbound" | "outbound";
}) {
  await logCallActivity({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    direction: input.direction,
    status: "completed",
    summary: input.summary,
    outcome: input.callSid,
  });

  await addAuditLog({
    workspaceId: input.workspaceId,
    userId: "user_alex",
    action: "voice_call_summary",
    input: input.contactPhone ?? "Unknown caller",
    output: input.summary,
    approvalStatus: "not_required",
  });

  if (input.leadId) {
    await addCrmNote({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      content: `Phone call summary: ${input.summary}`,
    });
  }
}

async function handleVoice(request: Request) {
  const url = new URL(request.url);
  const formData = request.method === "POST" ? await request.formData() : new FormData();

  const state = decodeVoiceState(url.searchParams.get("state"));
  const callSid = String(formData.get("CallSid") ?? url.searchParams.get("CallSid") ?? "");
  const to = String(formData.get("To") ?? url.searchParams.get("To") ?? "");
  const from = String(formData.get("From") ?? url.searchParams.get("From") ?? "");
  const speechResult = String(formData.get("SpeechResult") ?? "");
  const digits = String(formData.get("Digits") ?? "");
  const direction = directionMode(
    String(formData.get("Direction") ?? url.searchParams.get("Direction") ?? "inbound"),
  );
  const workspace =
    (state?.workspaceId ? await workspaceById(state.workspaceId) : null) ??
    (to ? await findWorkspaceByTwilioNumber(to) : null);

  if (!workspace) {
    throw new AppError("No workspace matched this Twilio number.", {
      code: "VOICE_WORKSPACE_NOT_FOUND",
      status: 404,
    });
  }

  const contactPhone = state?.contactPhone ?? (direction === "inbound" ? from : to);
  const lead = await findLeadByPhone(workspace.id, contactPhone);

  const activeState =
    state ??
    createVoiceSession({
      workspaceId: workspace.id,
      mode: direction,
      leadId: lead?.id,
      contactPhone,
      outboundContext: url.searchParams.get("script") ?? undefined,
    });

  const isRealtimeBootstrap =
    env().twilioRealtimeEnabled && !speechResult.trim() && !digits.trim();

  if (!state || isRealtimeBootstrap) {
    await logCallActivity({
      workspaceId: workspace.id,
      leadId: lead?.id,
      direction,
      status: "in_progress",
      summary: `AI ${direction} call started with ${lead?.name ?? contactPhone ?? "caller"}.`,
      outcome: callSid || undefined,
    });
  }

  if (isRealtimeBootstrap) {
    return realtimeStreamResponse({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      leadId: lead?.id,
      contactPhone,
      mode: direction,
      outboundContext: activeState.outboundContext,
    });
  }

  const utterance = utteranceFromTwilio({
    speechResult,
    digits,
  });

  if (!utterance) {
    if (!state) {
      const opening = openingLine(workspace, activeState);
      const next = nextState(activeState, {
        assistantReply: opening,
        intent: activeState.intent,
        summary: "Opened the forklift buy-or-sell phone conversation.",
        stage: "Opening qualification",
        noInputCount: 0,
      });
      return gatherReply(next, opening);
    }

    const decision = noInputDecision(activeState);
    const next = nextState(activeState, {
      assistantReply: decision.reply,
      intent: decision.intent,
      summary: decision.summary,
      stage: decision.stage,
      noInputCount: activeState.noInputCount + 1,
    });

    if (decision.completed) {
      await finalizeCall({
        workspaceId: workspace.id,
        leadId: activeState.leadId,
        callSid: callSid || undefined,
        contactPhone,
        summary: decision.summary,
        direction,
      });
      return sayAndHangup(workspace.id, decision.reply);
    }

    return gatherReply(next, decision.reply);
  }

  const decision = await generateVoiceDecision(workspace, activeState, utterance);
  const next = nextState(activeState, {
    userUtterance: utterance,
    assistantReply: decision.reply,
    intent: decision.intent,
    summary: decision.summary,
    stage: decision.stage,
    noInputCount: 0,
  });

  if (decision.completed) {
    await finalizeCall({
      workspaceId: workspace.id,
      leadId: activeState.leadId,
      callSid: callSid || undefined,
      contactPhone,
      summary: decision.summary,
      direction,
    });
    return sayAndHangup(workspace.id, decision.reply);
  }

  return gatherReply(next, decision.reply);
}

export async function GET(request: Request) {
  try {
    return await handleVoice(request);
  } catch (error) {
    const response = toErrorResponse(error);
    return sayAndHangup(
      "voice_fallback",
      response.body.error ?? "Sorry, the AEGIS phone agent hit an error.",
    );
  }
}

export async function POST(request: Request) {
  try {
    return await handleVoice(request);
  } catch (error) {
    const response = toErrorResponse(error);
    return sayAndHangup(
      "voice_fallback",
      response.body.error ?? "Sorry, the AEGIS phone agent hit an error.",
    );
  }
}
