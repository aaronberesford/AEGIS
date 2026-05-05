import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { type Workspace } from "@/lib/types";

const OPENAI_BASE = "https://api.openai.com/v1";
const MAX_TURNS = 8;
const MAX_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 180;

type CallIntent = "buy" | "sell" | "unknown";
type CallMode = "inbound" | "outbound";

type CallMessage = {
  role: "assistant" | "user";
  content: string;
};

export type VoiceSessionState = {
  workspaceId: string;
  mode: CallMode;
  leadId?: string;
  contactPhone?: string;
  intent: CallIntent;
  turnCount: number;
  noInputCount: number;
  history: CallMessage[];
  summary?: string;
  stage?: string;
  outboundContext?: string;
};

type VoiceAudioPayload = {
  text: string;
  workspaceId: string;
};

type VoiceDecision = {
  reply: string;
  intent: CallIntent;
  completed: boolean;
  summary: string;
  stage: string;
};

type InventoryItem = {
  sku: string;
  brand: string;
  model: string;
  year: number;
  power: "electric" | "diesel" | "LPG";
  capacityKg: number;
  mastM: number;
  hours: number;
  priceGbp: number;
  condition: string;
  location: string;
  note: string;
};

const forkliftInventory: InventoryItem[] = [
  {
    sku: "FPS-201",
    brand: "Toyota",
    model: "8FBE20",
    year: 2021,
    power: "electric",
    capacityKg: 2000,
    mastM: 4.8,
    hours: 1820,
    priceGbp: 14950,
    condition: "Refurbished",
    location: "Leeds",
    note: "Great for indoor warehouse work with side-shift and charger included.",
  },
  {
    sku: "FPS-233",
    brand: "Linde",
    model: "H25D",
    year: 2019,
    power: "diesel",
    capacityKg: 2500,
    mastM: 4.7,
    hours: 4280,
    priceGbp: 12900,
    condition: "Good used condition",
    location: "Sheffield",
    note: "Strong outdoor all-rounder with solid tyres and fork positioner.",
  },
  {
    sku: "FPS-247",
    brand: "Jungheinrich",
    model: "EFG 320",
    year: 2020,
    power: "electric",
    capacityKg: 2000,
    mastM: 5.5,
    hours: 2360,
    priceGbp: 13800,
    condition: "Very clean",
    location: "Bradford",
    note: "Ideal for narrow aisles and higher racking.",
  },
  {
    sku: "FPS-251",
    brand: "Hyster",
    model: "H3.0FT",
    year: 2018,
    power: "LPG",
    capacityKg: 3000,
    mastM: 4.5,
    hours: 5125,
    priceGbp: 11850,
    condition: "Mechanically sound",
    location: "Wakefield",
    note: "Popular mixed-use truck for yards and covered loading bays.",
  },
  {
    sku: "FPS-264",
    brand: "Doosan",
    model: "D35S-7",
    year: 2022,
    power: "diesel",
    capacityKg: 3500,
    mastM: 4.9,
    hours: 1195,
    priceGbp: 18400,
    condition: "Low-hour premium stock",
    location: "Doncaster",
    note: "Best fit for heavier outdoor lifting and busy depots.",
  },
];

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function phoneSecret() {
  return env().twilioAuthToken || env().openAiApiKey || "aegis-phone-dev";
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", phoneSecret()).update(payload).digest("base64url");
}

function compactText(value: string, maxLength = MAX_MESSAGE_LENGTH) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactHistory(history: CallMessage[]) {
  return history.slice(-MAX_HISTORY_MESSAGES).map((entry) => ({
    role: entry.role,
    content: compactText(entry.content, 160),
  }));
}

function normalizeIntent(value: string | undefined): CallIntent {
  if (value === "buy" || value === "sell") {
    return value;
  }
  return "unknown";
}

function inventorySummary() {
  return forkliftInventory
    .map(
      (item) =>
        `${item.sku}: ${item.year} ${item.brand} ${item.model}, ${item.power}, ${item.capacityKg}kg, ${item.mastM}m mast, ${item.hours} hours, GBP ${item.priceGbp}, ${item.condition}, ${item.location}. ${item.note}`,
    )
    .join("\n");
}

function detectIntentFromUtterance(utterance: string) {
  const text = utterance.toLowerCase();
  if (
    /\b(buy|looking to buy|purchase|need a forklift|for sale|available stock|inventory)\b/.test(
      text,
    )
  ) {
    return "buy" as const;
  }
  if (
    /\b(sell|looking to sell|trade in|part exchange|i have a forklift|dispose)\b/.test(
      text,
    )
  ) {
    return "sell" as const;
  }
  return "unknown" as const;
}

function isConversationDone(utterance: string) {
  return /\b(thanks|thank you|bye|goodbye|speak later|that'?s all|cheers)\b/i.test(utterance);
}

function demoDecision(state: VoiceSessionState, utterance: string): VoiceDecision {
  const detectedIntent =
    state.intent === "unknown" ? detectIntentFromUtterance(utterance) : state.intent;
  const text = utterance.toLowerCase();

  if (isConversationDone(utterance) && state.turnCount > 0) {
    return {
      reply:
        "Perfect, thanks for your time. I've logged the details and a forklift specialist will pick this up.",
      intent: detectedIntent,
      completed: true,
      summary: state.summary ?? "Caller completed the forklift phone test.",
      stage:
        detectedIntent === "sell"
          ? "Seller details captured"
          : detectedIntent === "buy"
            ? "Buyer enquiry qualified"
            : "General forklift enquiry",
    };
  }

  if (detectedIntent === "buy") {
    if (/\b(3 ton|3000|heavy|outdoor|yard)\b/.test(text)) {
      return {
        reply:
          "For a heavier outdoor job, our best fit is a 2022 Doosan D35S-7 diesel, 3.5 ton with a 4.9 metre mast. Would you like a guide price or do you need another spec?",
        intent: "buy",
        completed: false,
        summary: "Buyer is looking for a heavier outdoor forklift and was offered the Doosan D35S-7.",
        stage: "Buyer matched to heavy-duty stock",
      };
    }

    if (/\b(electric|warehouse|indoor|2 ton|2000)\b/.test(text)) {
      return {
        reply:
          "For indoor warehouse work, I can offer a 2021 Toyota 8FBE20 electric or a 2020 Jungheinrich EFG 320. Do you need up to 4.8 metres or closer to 5.5 metres lift height?",
        intent: "buy",
        completed: false,
        summary: "Buyer asked about electric warehouse stock and was offered Toyota and Jungheinrich options.",
        stage: "Buyer matched to electric stock",
      };
    }

    return {
      reply:
        "No problem. Are you looking to buy an electric, diesel or LPG truck, and roughly what lift capacity do you need?",
      intent: "buy",
      completed: false,
      summary: "Buyer enquiry is being qualified for power type and lift capacity.",
      stage: "Qualifying buyer requirements",
    };
  }

  if (detectedIntent === "sell") {
    if (!/\b(model|toyota|linde|hyster|doosan|jungheinrich)\b/.test(text)) {
      return {
        reply:
          "Happy to help with that. What is the make and model, and do you know the year of the truck?",
        intent: "sell",
        completed: false,
        summary: "Seller call started and AEGIS is collecting the truck make, model and year.",
        stage: "Collecting seller truck details",
      };
    }

    if (!/\b(hours|hour|price|condition|location)\b/.test(text)) {
      return {
        reply:
          "Great, and roughly how many hours has it done, what condition is it in, and what price are you hoping to achieve?",
        intent: "sell",
        completed: false,
        summary: `Seller shared the truck model details: ${compactText(utterance)}.`,
        stage: "Collecting seller valuation details",
      };
    }

    return {
      reply:
        "That gives me enough to log the appraisal. Please send over a few photos when you can, and our buying desk will review it.",
      intent: "sell",
      completed: true,
      summary: `Seller details captured: ${compactText(utterance)}.`,
      stage: "Seller appraisal logged",
    };
  }

  return {
    reply:
      "Thanks for calling Forklift Pro Solutions. Are you looking to buy a forklift truck, or sell one into stock today?",
    intent: "unknown",
    completed: false,
    summary: "Caller has not yet confirmed whether they want to buy or sell.",
    stage: "Opening qualification",
  };
}

function responseText(payload: {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function parseDecision(value: string) {
  try {
    return JSON.parse(value) as VoiceDecision;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as VoiceDecision;
    } catch {
      return null;
    }
  }
}

async function liveDecision(
  workspace: Workspace,
  state: VoiceSessionState,
  utterance: string,
): Promise<VoiceDecision> {
  const config = env();

  if (!config.openAiApiKey) {
    throw new AppError("OpenAI API key is missing.", {
      code: "OPENAI_MISSING_KEY",
      status: 400,
    });
  }

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: workspace.openAiModel || config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                `You are AEGIS, a phone sales agent for ${workspace.name}.`,
                `Industry: ${workspace.industry}. Tone: ${workspace.toneOfVoice}.`,
                "You are on a live Twilio phone call, so sound natural, warm and concise.",
                "Keep every spoken reply under 28 words and ask only one main question at a time.",
                "Use direct phrasing with no fluff so each turn is fast.",
                "The caller is speaking to a forklift dealership and remarketing desk.",
                "First priority is to determine whether the caller wants to buy or sell a forklift truck.",
                "If buying, qualify power type, load capacity, lift height, budget, timing and location, then recommend only from the inventory below.",
                "If selling, ask for make, model, year, fuel, lift capacity, mast height, hours, condition, asking price and location.",
                "Never mention that inventory is fake or simulated.",
                "If the caller asks what stock is available, use only the listed inventory.",
                "If the caller says thanks, bye, or indicates they are done, close politely and set completed true.",
                `Current intent: ${state.intent}.`,
                `Current stage: ${state.stage ?? "Opening qualification"}.`,
                state.outboundContext
                  ? `Outbound call context: ${state.outboundContext}.`
                  : "This may be an inbound call.",
                "Inventory:",
                inventorySummary(),
                "Return valid JSON only with this exact schema:",
                "{ reply: string, intent: 'buy'|'sell'|'unknown', completed: boolean, summary: string, stage: string }",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                callerUtterance: utterance,
                priorHistory: compactHistory(state.history),
                turnCount: state.turnCount,
                currentSummary: state.summary ?? "",
              }),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`OpenAI phone agent failed: ${detail || response.status}`, {
      code: "OPENAI_PHONE_AGENT_FAILED",
      status: 502,
    });
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };
  const decision = parseDecision(responseText(payload));

  if (!decision?.reply || typeof decision.completed !== "boolean") {
    throw new AppError("OpenAI returned an unreadable phone agent payload.", {
      code: "OPENAI_PHONE_AGENT_BAD_PAYLOAD",
      status: 502,
    });
  }

  return {
    reply: compactText(decision.reply),
    intent: normalizeIntent(decision.intent),
    completed: Boolean(decision.completed),
    summary: compactText(decision.summary || "Forklift phone call in progress.", 300),
    stage: compactText(decision.stage || "Phone qualification", 120),
  };
}

export function openingLine(workspace: Workspace, state: VoiceSessionState) {
  if (workspace.industry.toLowerCase().includes("material")) {
    if (state.mode === "outbound") {
      const context = state.outboundContext
        ? `${compactText(state.outboundContext, 70)} `
        : "";
      return compactText(
        `Hello, this is AEGIS, the AI assistant at ${workspace.name}. ${context}Are you looking to buy or sell a forklift today?`,
        150,
      );
    }

    return `Hello, this is AEGIS, the AI assistant at ${workspace.name}. Are you looking to buy a forklift, or sell one into stock today?`;
  }

  return `Hello, you've reached ${workspace.name}. How can I help you today?`;
}

export function createVoiceSession(input: {
  workspaceId: string;
  mode: CallMode;
  leadId?: string;
  contactPhone?: string;
  outboundContext?: string;
}) {
  return {
    workspaceId: input.workspaceId,
    mode: input.mode,
    leadId: input.leadId,
    contactPhone: input.contactPhone,
    intent: "unknown",
    turnCount: 0,
    noInputCount: 0,
    history: [],
    outboundContext: input.outboundContext ? compactText(input.outboundContext, 120) : undefined,
  } satisfies VoiceSessionState;
}

export function buildVoiceWebhookUrl(input: {
  workspaceId: string;
  mode: CallMode;
  leadId?: string;
  contactPhone?: string;
  outboundContext?: string;
}) {
  const url = new URL("/api/twilio/voice-script", env().appUrl);
  const state = createVoiceSession(input);
  url.searchParams.set("state", encodeVoiceState(state));
  return url.toString();
}

export function britishVoiceInstructions(workspace: Workspace) {
  return [
    "Speak in clear British English.",
    `Sound like a warm, confident AI sales assistant for ${workspace.name}.`,
    "Keep a natural pace and avoid sounding robotic.",
    "Use short, crisp phrasing suitable for a live phone call.",
  ].join(" ");
}

export function buildVoiceAudioUrl(input: VoiceAudioPayload) {
  const payload = JSON.stringify({
    workspaceId: input.workspaceId,
    text: compactText(input.text, 220),
  } satisfies VoiceAudioPayload);
  const url = new URL("/api/twilio/voice-audio", env().appUrl);
  url.searchParams.set("payload", base64UrlEncode(payload));
  url.searchParams.set("sig", signPayload(payload));
  return url.toString();
}

export function decodeVoiceAudioPayload(payload: string | null, sig: string | null) {
  if (!payload || !sig) {
    return null;
  }

  const decoded = base64UrlDecode(payload);
  if (signPayload(decoded) !== sig) {
    return null;
  }

  const parsed = JSON.parse(decoded) as VoiceAudioPayload;
  return {
    workspaceId: String(parsed.workspaceId),
    text: compactText(String(parsed.text ?? ""), 220),
  } satisfies VoiceAudioPayload;
}

export function encodeVoiceState(state: VoiceSessionState) {
  const payload = JSON.stringify({
    ...state,
    history: compactHistory(state.history),
    summary: state.summary ? compactText(state.summary, 300) : undefined,
    stage: state.stage ? compactText(state.stage, 120) : undefined,
    outboundContext: state.outboundContext
      ? compactText(state.outboundContext, 120)
      : undefined,
  });
  return `${base64UrlEncode(payload)}.${signPayload(payload)}`;
}

export function decodeVoiceState(value: string | null) {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const payload = base64UrlDecode(encodedPayload);
  if (signPayload(payload) !== signature) {
    return null;
  }

  const parsed = JSON.parse(payload) as VoiceSessionState;
  return {
    ...parsed,
    intent: normalizeIntent(parsed.intent),
    history: compactHistory(parsed.history ?? []),
    turnCount: Number(parsed.turnCount ?? 0),
    noInputCount: Number(parsed.noInputCount ?? 0),
  } satisfies VoiceSessionState;
}

export function nextState(
  state: VoiceSessionState,
  update: {
    userUtterance?: string;
    assistantReply: string;
    intent: CallIntent;
    summary: string;
    stage: string;
    noInputCount?: number;
  },
) {
  const history = [...state.history];
  if (update.userUtterance) {
    history.push({ role: "user", content: compactText(update.userUtterance) });
  }
  history.push({ role: "assistant", content: compactText(update.assistantReply) });

  return {
    ...state,
    intent: update.intent,
    turnCount: state.turnCount + (update.userUtterance ? 1 : 0),
    noInputCount: update.noInputCount ?? 0,
    history: compactHistory(history),
    summary: compactText(update.summary, 300),
    stage: compactText(update.stage, 120),
  } satisfies VoiceSessionState;
}

export function noInputDecision(state: VoiceSessionState): VoiceDecision {
  if (state.noInputCount >= 1) {
    return {
      reply:
        "No problem, I'll wrap this up for now. When you're ready, call back and I can help with buying or selling a forklift truck.",
      intent: state.intent,
      completed: true,
      summary: state.summary ?? "Call ended after repeated no-audio timeouts.",
      stage: state.stage ?? "No response",
    };
  }

  if (state.intent === "sell") {
    return {
      reply:
        "Sorry, I missed that. Could you repeat the make and model, plus the year if you know it?",
      intent: "sell",
      completed: false,
      summary: state.summary ?? "Seller call continued after one no-audio timeout.",
      stage: state.stage ?? "Collecting seller truck details",
    };
  }

  if (state.intent === "buy") {
    return {
      reply:
        "Sorry, I missed that. Could you repeat the power type you need and roughly what lift capacity you are looking for?",
      intent: "buy",
      completed: false,
      summary: state.summary ?? "Buyer call continued after one no-audio timeout.",
      stage: state.stage ?? "Qualifying buyer requirements",
    };
  }

  return {
    reply:
      "Sorry, I didn't catch that. Are you looking to buy a forklift truck, or sell one into stock today?",
    intent: "unknown",
    completed: false,
    summary: state.summary ?? "Caller did not answer the buy-or-sell question yet.",
    stage: state.stage ?? "Opening qualification",
  };
}

export async function generateVoiceDecision(
  workspace: Workspace,
  state: VoiceSessionState,
  utterance: string,
) {
  if (state.turnCount >= MAX_TURNS) {
    return {
      reply:
        "Thanks, that's enough for me to log this properly. A forklift specialist will review the details and pick it up from here.",
      intent: state.intent,
      completed: true,
      summary: state.summary ?? "Call ended after the maximum number of test turns.",
      stage: state.stage ?? "Call wrapped",
    } satisfies VoiceDecision;
  }

  if (env().demoMode) {
    return demoDecision(state, utterance);
  }

  return liveDecision(workspace, state, utterance);
}

export function utteranceFromTwilio(input: { speechResult?: string; digits?: string }) {
  const speech = compactText(input.speechResult ?? "", 240);
  if (speech) {
    return speech;
  }

  if (input.digits === "1") {
    return "I want to buy a forklift truck.";
  }

  if (input.digits === "2") {
    return "I want to sell a forklift truck.";
  }

  return "";
}
