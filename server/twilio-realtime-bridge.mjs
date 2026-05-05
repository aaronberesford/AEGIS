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

function buildInstructions(workspaceName, inventory, outboundContext = "") {
  return [
    `You are AEGIS, the live AI phone assistant for ${workspaceName}.`,
    "Speak in natural British English with a calm, polished customer service tone.",
    "Sound conversational and human, not robotic.",
    "Keep replies very short, usually one sentence and under 20 words.",
    "Ask only one question at a time.",
    "The caller is talking to a forklift dealership and remarketing desk.",
    "Start by finding out whether they want to buy a forklift or sell one.",
    "If buying, ask for power type, lift capacity, lift height, budget, timing and location, then recommend matching stock only from this inventory.",
    "If selling, ask for make, model, year, fuel, lift capacity, mast height, hours, condition, asking price and location.",
    "Do not mention that inventory is fake or simulated.",
    "If the caller says thanks or bye, close politely and naturally.",
    outboundContext ? `Outbound context: ${outboundContext}` : "",
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

  return `Greet the caller for ${workspaceName} and ask whether they want to buy a forklift or sell one today.`;
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
  let callInfo = {
    workspaceName: "Forklift Pro Solutions",
    outboundContext: "",
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
            workspaceName: custom.workspaceName || "Forklift Pro Solutions",
            outboundContext: custom.outboundContext || "",
          };
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
