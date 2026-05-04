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
                "Return valid JSON only.",
                "If the user asks to send SMS or make a call, you must create an approval draft instead of claiming the action already happened.",
                "JSON schema: { reply: string, intent: 'general'|'send_sms'|'make_call'|'create_automation'|'schedule_task', approvalTitle?: string, recipient?: string, message?: string, reason?: string, risk?: 'low'|'medium'|'high', taskTitle?: string, taskDueLabel?: string, automationName?: string, automationTrigger?: string, automationActions?: string[] }",
                "Keep the reply concise and operational.",
              ].join(" "),
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

export async function synthesizeSpeech(text: string, voice = "alloy") {
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
      model: config.openAiSpeechModel,
      voice,
      input: text,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`OpenAI speech failed: ${detail || response.status}`, {
      code: "OPENAI_TTS_FAILED",
      status: 502,
    });
  }

  const bytes = Buffer.from(await response.arrayBuffer());
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
