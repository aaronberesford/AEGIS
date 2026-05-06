import http from "node:http";
import process from "node:process";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@base44/sdk";

const PORT = Number(
  process.env.PORT ?? process.env.TWILIO_MEDIA_STREAM_PORT ?? "3001",
);
const HOST = process.env.HOST ?? "0.0.0.0";
const PATHNAME = "/media-stream";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-1.5";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "cedar";
const BASE44_APP_ID = process.env.BASE44_APP_ID ?? "";
const BASE44_API_KEY = process.env.BASE44_API_KEY ?? "";
const BASE44_CACHE_MS = 2 * 60 * 1000;
const AEGIS_SYNC_URL = process.env.AEGIS_SYNC_URL ?? "";
const AEGIS_PHONE_SYNC_SECRET = process.env.AEGIS_PHONE_SYNC_SECRET ?? "";

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY for Twilio realtime bridge.");
  process.exit(1);
}

let cachedInventory = {
  expiresAt: 0,
  text: [
    "FPS-201: 2021 Toyota 8FBE20 electric, 2000kg, 4.8m mast, 1820 hours, GBP 14,950, Leeds.",
    "FPS-233: 2019 Linde H25D diesel, 2500kg, 4.7m mast, 4280 hours, GBP 12,900, Sheffield.",
    "FPS-247: 2020 Jungheinrich EFG 320 electric, 2000kg, 5.5m mast, 2360 hours, GBP 13,800, Bradford.",
    "FPS-251: 2018 Hyster H3.0FT LPG, 3000kg, 4.5m mast, 5125 hours, GBP 11,850, Wakefield.",
    "FPS-264: 2022 Doosan D35S-7 diesel, 3500kg, 4.9m mast, 1195 hours, GBP 18,400, Doncaster.",
  ].join("\n"),
};

let cachedCustomers = {
  expiresAt: 0,
  items: [],
};

function normalizeMastHeight(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  if (value > 100) {
    return `${(value / 1000).toFixed(1)}m`;
  }

  return `${value}m`;
}

function defaultInventory() {
  return cachedInventory.text;
}

function normalizePhone(value) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

function phoneCandidates(phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  const digitsOnly = normalized.replace(/[^\d]/g, "");
  const suffix = digitsOnly.length > 9 ? digitsOnly.slice(-9) : digitsOnly;
  return new Set([normalized, digitsOnly, suffix].filter(Boolean));
}

async function loadBase44Inventory() {
  if (!BASE44_APP_ID || !BASE44_API_KEY) {
    return defaultInventory();
  }

  if (cachedInventory.expiresAt > Date.now()) {
    return cachedInventory.text;
  }

  const client = createClient({
    appId: BASE44_APP_ID,
    headers: {
      api_key: BASE44_API_KEY,
    },
  });

  try {
    const forklifts = await client.entities.Forklift.list("-updated_date", 40);
    const lines = forklifts
      .filter((item) => (item.stock_status ?? "In Stock") !== "Sold")
      .slice(0, 20)
      .map((item) => {
        const title =
          item.title?.trim() ||
          [item.brand, item.model].filter(Boolean).join(" ").trim() ||
          item.listing_id ||
          "Forklift";
        const details = [
          item.listing_id,
          item.year ? String(item.year) : null,
          item.fuel_type ?? null,
          typeof item.capacity_tonnes === "number"
            ? `${Math.round(item.capacity_tonnes * 1000)}kg`
            : null,
          normalizeMastHeight(item.mast_height_m),
          item.mast_type ?? null,
          item.price_display ?? null,
          item.stock_status ?? null,
          item.location ? `Location: ${item.location}` : null,
        ]
          .filter(Boolean)
          .join(", ");

        return `${title}: ${details}`;
      });

    if (lines.length > 0) {
      cachedInventory = {
        expiresAt: Date.now() + BASE44_CACHE_MS,
        text: lines.join("\n"),
      };
      return cachedInventory.text;
    }

    return defaultInventory();
  } catch (error) {
    console.error("Base44 inventory load failed in realtime bridge:", error);
    return defaultInventory();
  } finally {
    client.cleanup();
  }
}

async function loadBase44CustomerByPhone(phoneNumber) {
  if (!BASE44_APP_ID || !BASE44_API_KEY || !phoneNumber) {
    return null;
  }

  const candidates = phoneCandidates(phoneNumber);
  if (cachedCustomers.expiresAt <= Date.now()) {
    const client = createClient({
      appId: BASE44_APP_ID,
      headers: {
        api_key: BASE44_API_KEY,
      },
    });

    try {
      const customers = await client.entities.Customer.list("-updated_date", 120);
      cachedCustomers = {
        expiresAt: Date.now() + BASE44_CACHE_MS,
        items: customers,
      };
    } catch (error) {
      console.error("Base44 customer load failed in realtime bridge:", error);
      return null;
    } finally {
      client.cleanup();
    }
  }

  return (
    cachedCustomers.items.find((customer) => {
      const customerCandidates = phoneCandidates(customer.phone ?? "");
      return [...customerCandidates].some((candidate) => candidates.has(candidate));
    }) ?? null
  );
}

function customerContext(customer) {
  if (!customer) {
    return "No previous Base44 customer record was found. If they are new, capture their full name, company, email and best callback details before ending the call.";
  }

  return [
    `Returning caller details: ${customer.name || "Unknown name"}.`,
    customer.company ? `Company: ${customer.company}.` : "",
    customer.email ? `Email: ${customer.email}.` : "",
    customer.type ? `Customer type: ${customer.type}.` : "",
    customer.notes ? `Previous notes: ${customer.notes}` : "",
    "Acknowledge them as an existing contact and continue naturally.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildInstructions(
  workspaceName,
  inventory,
  outboundContext = "",
  existingCustomerContext = "",
) {
  return [
    `You are AEGIS, the live AI phone assistant for ${workspaceName}.`,
    "Speak in natural British English with a calm, polished customer service tone.",
    "Sound conversational and human, not robotic.",
    "Keep replies very short, usually one sentence and under 20 words.",
    "Ask only one question at a time.",
    "The caller is talking to a forklift dealership and remarketing desk.",
    "Start by finding out whether they want to buy a forklift or sell one.",
    "If buying, ask for power type, lift capacity, lift height, budget, timing and location, then recommend matching stock only from this inventory.",
    "If the caller wants to buy a truck now, confirm the exact truck or listing ID, the quoted price, whether it is a business or personal purchase, their full name, company, phone, email and delivery postcode.",
    "For a buy-now caller, tell them you will send the listing link and purchase summary, and that the team can send the invoice or payment link next.",
    "Do not collect card or bank payment details over the phone.",
    "If selling, ask for make, model, year, fuel, lift capacity, mast height, hours, condition, asking price and location.",
    "Always work out whether the caller is already known or a new contact.",
    "For new callers, collect full name, company and email before ending the call.",
    "If they do not buy or sell today, make sure the conversation leaves a clear callback or follow-up action.",
    "Do not mention that inventory is fake or simulated.",
    "If the caller says thanks or bye, close politely and naturally.",
    outboundContext ? `Outbound context: ${outboundContext}` : "",
    existingCustomerContext,
    "Inventory:",
    inventory,
  ]
    .filter(Boolean)
    .join("\n");
}

function initialPrompt(workspaceName, outboundContext = "") {
  if (outboundContext) {
    return `Open the call for ${workspaceName}. Mention this context briefly: ${outboundContext}. Then ask whether they want to buy or sell a forklift today.`;
  }

  return `Greet the caller for ${workspaceName} and ask whether they want to buy a forklift or sell one today. If they want to buy immediately, gather the truck reference and buyer details before ending the call.`;
}

function collectText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pushTranscriptTurn(turns, speaker, text) {
  const cleaned = collectText(text);
  if (!cleaned) {
    return;
  }

  const last = turns[turns.length - 1];
  if (last && last.speaker === speaker && last.text === cleaned) {
    return;
  }

  turns.push({ speaker, text: cleaned });
}

async function syncCallOutcome(input) {
  if (!AEGIS_SYNC_URL || !AEGIS_PHONE_SYNC_SECRET || !input.transcript?.trim()) {
    return;
  }

  const response = await fetch(`${AEGIS_SYNC_URL.replace(/\/$/, "")}/api/twilio/voice-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-aegis-sync-secret": AEGIS_PHONE_SYNC_SECRET,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Voice sync request failed:", detail || response.status);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "twilio-realtime-bridge" }));
    return;
  }

  if (req.url === PATHNAME) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, websocket: PATHNAME }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (url.pathname !== PATHNAME) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (twilioWs) => {
  let streamSid = null;
  let sessionReady = false;
  let startedGreeting = false;
  let inventoryText = defaultInventory();
  let customer = null;
  let syncSubmitted = false;
  const transcriptTurns = [];
  let callInfo = {
    workspaceName: "Forklift Pro Solutions",
    outboundContext: "",
    workspaceId: "",
    leadId: "",
    contactPhone: "",
    callSid: "",
    mode: "inbound",
  };

  const openAiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    },
  );

  const sendOpenAi = (payload) => {
    if (openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.send(JSON.stringify(payload));
    }
  };

  const refreshInstructions = async () => {
    inventoryText = await loadBase44Inventory();
    sendOpenAi({
      type: "session.update",
      session: {
        instructions: buildInstructions(
          callInfo.workspaceName,
          inventoryText,
          callInfo.outboundContext,
          customerContext(customer),
        ),
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: { type: "server_vad" },
          },
          output: {
            format: { type: "audio/pcmu" },
            voice: REALTIME_VOICE,
          },
        },
      },
    });
  };

  const submitSync = async () => {
    if (syncSubmitted || !callInfo.workspaceId) {
      return;
    }

    syncSubmitted = true;
    await syncCallOutcome({
      workspaceId: callInfo.workspaceId,
      callSid: callInfo.callSid || undefined,
      phoneNumber: callInfo.contactPhone || undefined,
      direction: callInfo.mode === "outbound" ? "outbound" : "inbound",
      transcript: transcriptTurns
        .map((turn) => `${turn.speaker === "caller" ? "Caller" : "AEGIS"}: ${turn.text}`)
        .join("\n"),
      knownCustomerId: customer?.id ?? null,
    });
  };

  const maybeStartGreeting = () => {
    if (!streamSid || !sessionReady || startedGreeting) {
      return;
    }

    startedGreeting = true;
    sendOpenAi({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions: initialPrompt(callInfo.workspaceName, callInfo.outboundContext),
      },
    });
  };

  openAiWs.on("open", async () => {
    inventoryText = await loadBase44Inventory();
    sendOpenAi({
      type: "session.update",
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: buildInstructions(
          callInfo.workspaceName,
          inventoryText,
          callInfo.outboundContext,
        ),
        output_modalities: ["audio"],
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: { type: "server_vad" },
          },
          output: {
            format: { type: "audio/pcmu" },
            voice: REALTIME_VOICE,
          },
        },
      },
    });
  });

  openAiWs.on("message", (message) => {
    try {
      const event = JSON.parse(String(message));

      if (event.type === "session.updated") {
        sessionReady = true;
        maybeStartGreeting();
        return;
      }

      if (event.type === "conversation.item.input_audio_transcription.completed") {
        pushTranscriptTurn(transcriptTurns, "caller", event.transcript);
        return;
      }

      if (event.type === "response.audio_transcript.done") {
        pushTranscriptTurn(transcriptTurns, "assistant", event.transcript);
        return;
      }

      if (event.type === "response.output_text.done") {
        pushTranscriptTurn(transcriptTurns, "assistant", event.text);
        return;
      }

      if (event.type === "response.done") {
        const outputs = event.response?.output ?? [];
        for (const item of outputs) {
          const content = item?.content ?? [];
          for (const part of content) {
            if (part?.transcript) {
              pushTranscriptTurn(transcriptTurns, "assistant", part.transcript);
            } else if (part?.text) {
              pushTranscriptTurn(transcriptTurns, "assistant", part.text);
            }
          }
        }
        return;
      }

      if (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
        if (!streamSid || !event.delta || twilioWs.readyState !== WebSocket.OPEN) {
          return;
        }

        twilioWs.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: event.delta },
          }),
        );
        return;
      }

      if (event.type === "input_audio_buffer.speech_started" && streamSid) {
        if (twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        }
        sendOpenAi({ type: "response.cancel" });
      }
    } catch (error) {
      console.error("OpenAI realtime parse error:", error);
    }
  });

  openAiWs.on("error", (error) => {
    console.error("OpenAI realtime websocket error:", error);
    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.close();
    }
  });

  openAiWs.on("close", () => {
    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.close();
    }
  });

  twilioWs.on("message", async (message) => {
    try {
      const event = JSON.parse(String(message));

      switch (event.event) {
        case "start": {
          streamSid = event.start?.streamSid ?? null;
          const custom = event.start?.customParameters ?? {};
          callInfo = {
            workspaceId: custom.workspaceId || "",
            workspaceName: custom.workspaceName || "Forklift Pro Solutions",
            outboundContext: custom.outboundContext || "",
            leadId: custom.leadId || "",
            contactPhone: custom.contactPhone || "",
            callSid: event.start?.callSid || "",
            mode: custom.mode || "inbound",
          };
          customer = await loadBase44CustomerByPhone(callInfo.contactPhone);
          await refreshInstructions();
          maybeStartGreeting();
          break;
        }

        case "media":
          sendOpenAi({
            type: "input_audio_buffer.append",
            audio: event.media?.payload,
          });
          break;

        case "stop":
          await submitSync();
          if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.close();
          }
          break;

        default:
          break;
      }
    } catch (error) {
      console.error("Twilio websocket parse error:", error);
    }
  });

  twilioWs.on("close", () => {
    void submitSync();
    if (openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
  });

  twilioWs.on("error", (error) => {
    console.error("Twilio websocket error:", error);
    if (openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Twilio realtime bridge listening on http://${HOST}:${PORT}`);
});
