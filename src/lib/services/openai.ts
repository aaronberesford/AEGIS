import "server-only";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { type Workspace } from "@/lib/types";

const OPENAI_BASE = "https://api.openai.com/v1";

type AgentDecision = {
  reply: string;
  intent:
    | "general"
    | "send_sms"
    | "make_call"
    | "create_automation"
    | "schedule_task";
  approvalTitle?: string;
  recipient?: string;
  message?: string;
  reason?: string;
  risk?: "low" | "medium" | "high";
  taskTitle?: string;
  taskDueLabel?: string;
  automationName?: string;
  automationTrigger?: string;
  automationActions?: string[];
};

export type PhoneCallOutcome = {
  summary: string;
  intent: "buy" | "sell" | "support" | "unknown";
  purchaseIntent: "ready_now" | "considering" | "not_buying" | "unknown";
  callerName?: string | null;
  company?: string | null;
  email?: string | null;
  buyerType?: "business" | "personal" | "unknown";
  selectedListingId?: string | null;
  selectedTruckTitle?: string | null;
  deliveryPostcode?: string | null;
  requestedCallback: boolean;
  callbackTiming?: string | null;
  purchaseCompleted: boolean;
  shouldCreateLead: boolean;
  leadStatus: string;
  requirementsSummary: string;
  nextAction: string;
  customerHistoryNote: string;
  wantsPurchaseSummary: boolean;
  wantsInvoiceLink: boolean;
};

export type WorkspaceIssue = {
  type: string;
  linkedEntityId?: string;
  title: string;
  detail: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type WorkspaceSuggestionDraft = {
  issueType: string;
  title: string;
  description: string;
  suggestedAction: string;
  priority: "low" | "medium" | "high";
  actionType?: "notify" | "create_task" | "send_sms" | "call_customer" | "update_website" | "bulk_update" | "none";
};

function requireOpenAiConfig() {
  const config = env();

  if (config.demoMode) {
    return config;
  }

  if (!config.openAiApiKey) {
    throw new AppError("OpenAI API key is missing.", {
      code: "OPENAI_MISSING_KEY",
      status: 400,
    });
  }

  return config;
}

async function parseJsonResponse<T>(response: Response) {
  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`OpenAI request failed: ${detail || response.status}`, {
      code: "OPENAI_REQUEST_FAILED",
      status: 502,
    });
  }

  return (await response.json()) as T;
}

function extractResponseText(payload: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const messageTexts =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean) ?? [];

  return messageTexts.join("\n");
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

export async function generateAgentDecision(input: {
  workspace: Workspace;
  message: string;
  knowledgeContext?: string | null;
}) {
  const config = requireOpenAiConfig();

  if (config.demoMode) {
    return null;
  }

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                `You are AEGIS for ${input.workspace.name}.`,
                `Industry: ${input.workspace.industry}.`,
                `Tone of voice: ${input.workspace.toneOfVoice}.`,
                `Services: ${input.workspace.services.join(", ")}.`,
                `Target customers: ${input.workspace.targetCustomers.join(", ")}.`,
                input.workspace.externalKnowledge
                  ? `Connected knowledge source: ${input.workspace.externalKnowledge.source} (${input.workspace.externalKnowledge.appName}). ${input.workspace.externalKnowledge.summary}`
                  : null,
                input.knowledgeContext
                  ? `Live business context from connected systems:\n${input.knowledgeContext}`
                  : null,
                "Return valid JSON only.",
                "If the user asks to send SMS or make a call, you must create an approval draft instead of claiming the action already happened.",
                "JSON schema: { reply: string, intent: 'general'|'send_sms'|'make_call'|'create_automation'|'schedule_task', approvalTitle?: string, recipient?: string, message?: string, reason?: string, risk?: 'low'|'medium'|'high', taskTitle?: string, taskDueLabel?: string, automationName?: string, automationTrigger?: string, automationActions?: string[] }",
                "Keep the reply concise and operational.",
              ]
                .filter(Boolean)
                .join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: input.message,
            },
          ],
        },
      ],
    }),
  });

  const payload = await parseJsonResponse<{
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  }>(response);
  const parsed = safeJsonParse<AgentDecision>(extractResponseText(payload));

  if (!parsed?.reply || !parsed.intent) {
    throw new AppError("OpenAI returned an unreadable agent payload.", {
      code: "OPENAI_BAD_PAYLOAD",
      status: 502,
    });
  }

  return parsed;
}

export async function transcribeAudio(file: Blob) {
  const config = requireOpenAiConfig();

  if (config.demoMode) {
    return null;
  }

  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", file, "aegis.webm");

  const response = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: form,
  });

  const payload = await parseJsonResponse<{ text?: string }>(response);

  if (!payload.text) {
    throw new AppError("OpenAI did not return a transcript.", {
      code: "OPENAI_EMPTY_TRANSCRIPT",
      status: 502,
    });
  }

  return payload.text;
}

type SpeechFormat = "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm";

type SpeechOptions = {
  voice?: string;
  format?: SpeechFormat;
  instructions?: string;
  model?: string;
};

export async function synthesizeSpeechBuffer(
  text: string,
  options: SpeechOptions = {},
) {
  const config = requireOpenAiConfig();

  if (config.demoMode) {
    return null;
  }

  const response = await fetch(`${OPENAI_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? config.openAiSpeechModel,
      voice: options.voice ?? "alloy",
      input: text,
      format: options.format ?? "mp3",
      instructions: options.instructions,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`OpenAI speech failed: ${detail || response.status}`, {
      code: "OPENAI_TTS_FAILED",
      status: 502,
    });
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function synthesizeSpeech(text: string, voice = "alloy") {
  const bytes = await synthesizeSpeechBuffer(text, { voice, format: "mp3" });

  if (!bytes) {
    return null;
  }

  return bytes.toString("base64");
}

export async function testOpenAiConnection() {
  const config = requireOpenAiConfig();

  if (config.demoMode) {
    return {
      ok: true,
      detail: "Demo mode is enabled. OpenAI calls are mocked.",
    };
  }

  const response = await fetch(`${OPENAI_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`OpenAI connection failed: ${detail || response.status}`, {
      code: "OPENAI_CONNECTION_FAILED",
      status: 502,
    });
  }

  return {
    ok: true,
    detail: `OpenAI connection is valid. Default model: ${config.openAiModel}.`,
  };
}

export async function extractPhoneCallOutcome(input: {
  workspace: Workspace;
  phoneNumber: string;
  direction: "inbound" | "outbound";
  transcript: string;
  existingCustomerContext?: string | null;
}) {
  const config = requireOpenAiConfig();

  if (config.demoMode) {
    return {
      summary: `Phone call with ${input.phoneNumber}.`,
      intent: "unknown",
      purchaseIntent: "unknown",
      requestedCallback: true,
      callbackTiming: "tomorrow morning",
      purchaseCompleted: false,
      shouldCreateLead: true,
      leadStatus: "Phone enquiry",
      requirementsSummary: "Manual review required.",
      nextAction: "Call back and review the enquiry.",
      customerHistoryNote: `Phone call captured for ${input.phoneNumber}. Follow-up required.`,
      wantsPurchaseSummary: false,
      wantsInvoiceLink: false,
    } satisfies PhoneCallOutcome;
  }

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                `You extract structured forklift-sales call outcomes for ${input.workspace.name}.`,
                `Industry: ${input.workspace.industry}.`,
                `Direction: ${input.direction}. Caller phone: ${input.phoneNumber}.`,
                input.existingCustomerContext
                  ? `Existing customer context: ${input.existingCustomerContext}`
                  : "No previous customer context was found.",
                "Return valid JSON only.",
                "Infer whether this was a buy enquiry, sell enquiry, support call, or unknown.",
                "If the caller wants to move forward with a specific truck now, set purchaseIntent to ready_now even if payment was not taken on the call.",
                "If they are interested but not ready to commit, use considering.",
                "If they decline or only wanted information, use not_buying.",
                "For buy-now calls, capture the selected listing ID or truck title if clearly stated, whether this is a business or personal purchase, and the delivery postcode if mentioned.",
                "If no purchase happened, set requestedCallback true when a callback or follow-up is clearly needed.",
                "If the caller is new or there is a commercial opportunity, set shouldCreateLead true.",
                "leadStatus should be a short CRM status such as Phone enquiry, Buying enquiry, Selling enquiry, Qualified, Follow-up required, or Won.",
                "customerHistoryNote should be one short paragraph suitable to append to a customer notes field.",
                "Set wantsPurchaseSummary true when AEGIS should draft a follow-up email or SMS with the truck reference and call summary.",
                "Set wantsInvoiceLink true when the caller is clearly ready to buy and expects invoice or payment details next.",
                "JSON schema: { summary: string, intent: 'buy'|'sell'|'support'|'unknown', purchaseIntent: 'ready_now'|'considering'|'not_buying'|'unknown', callerName?: string|null, company?: string|null, email?: string|null, buyerType?: 'business'|'personal'|'unknown', selectedListingId?: string|null, selectedTruckTitle?: string|null, deliveryPostcode?: string|null, requestedCallback: boolean, callbackTiming?: string|null, purchaseCompleted: boolean, shouldCreateLead: boolean, leadStatus: string, requirementsSummary: string, nextAction: string, customerHistoryNote: string, wantsPurchaseSummary: boolean, wantsInvoiceLink: boolean }",
              ]
                .filter(Boolean)
                .join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: input.transcript,
            },
          ],
        },
      ],
    }),
  });

  const payload = await parseJsonResponse<{
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  }>(response);
  const parsed = safeJsonParse<PhoneCallOutcome>(extractResponseText(payload));

  if (
    !parsed?.summary ||
    !parsed.intent ||
    !parsed.purchaseIntent ||
    !parsed.leadStatus ||
    !parsed.nextAction
  ) {
    throw new AppError("OpenAI returned an unreadable phone call outcome.", {
      code: "OPENAI_BAD_PHONE_CALL_PAYLOAD",
      status: 502,
    });
  }

  return parsed;
}

export async function generateWorkspaceSuggestionDrafts(input: {
  workspace: Workspace;
  issues: WorkspaceIssue[];
  mode: "check" | "deep_scan";
}) {
  const config = requireOpenAiConfig();

  if (config.demoMode) {
    return input.issues.slice(0, 5).map((issue) => ({
      issueType: issue.type,
      title: issue.title,
      description: issue.detail,
      suggestedAction: "Review this issue in AEGIS and prepare the next follow-up step.",
      priority: "medium",
      actionType: "notify",
    })) satisfies WorkspaceSuggestionDraft[];
  }

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You are AEGIS, a proactive AI business operator.",
                `Workspace: ${input.workspace.name}. Industry: ${input.workspace.industry}.`,
                `Run mode: ${input.mode}.`,
                "Given these issues, generate concise operational suggestions.",
                "Return valid JSON only as an array with up to 5 items.",
                "Each item must follow this schema: { issueType: string, title: string, description: string, suggestedAction: string, priority: 'low'|'medium'|'high', actionType?: 'notify'|'create_task'|'send_sms'|'call_customer'|'update_website'|'bulk_update'|'none' }.",
                "Use risky action types only when clearly justified.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(input.issues),
            },
          ],
        },
      ],
    }),
  });

  const payload = await parseJsonResponse<{
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  }>(response);

  const parsed = safeJsonParse<WorkspaceSuggestionDraft[]>(extractResponseText(payload));
  if (!Array.isArray(parsed)) {
    throw new AppError("OpenAI returned unreadable workspace suggestions.", {
      code: "OPENAI_BAD_SUGGESTION_PAYLOAD",
      status: 502,
    });
  }

  return parsed.slice(0, 5);
}

export async function generateDailyWorkspaceSummary(input: {
  workspace: Workspace;
  leadsNeedingFollowUp: number;
  overdueTasks: number;
  pendingApprovals: number;
}) {
  const config = requireOpenAiConfig();

  if (config.demoMode) {
    return [
      `Leads needing follow-up: ${input.leadsNeedingFollowUp}.`,
      `Overdue tasks: ${input.overdueTasks}.`,
      `Pending approvals: ${input.pendingApprovals}.`,
    ].join(" ");
  }

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Summarise today's priorities for this business in 3-5 short bullet points.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                workspace: input.workspace.name,
                leadsNeedingFollowUp: input.leadsNeedingFollowUp,
                overdueTasks: input.overdueTasks,
                pendingApprovals: input.pendingApprovals,
              }),
            },
          ],
        },
      ],
    }),
  });

  const payload = await parseJsonResponse<{
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  }>(response);
  const text = extractResponseText(payload).trim();
  if (!text) {
    throw new AppError("OpenAI returned an empty daily summary.", {
      code: "OPENAI_EMPTY_DAILY_SUMMARY",
      status: 502,
    });
  }

  return text;
}
