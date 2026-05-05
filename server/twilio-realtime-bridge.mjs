import http from "node:http";
import process from "node:process";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.TWILIO_MEDIA_STREAM_PORT ?? "3001");
const PATHNAME = "/media-stream";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-1.5";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";
const TURN_MODE = process.env.OPENAI_REALTIME_TURN_MODE ?? "semantic_vad";
const TURN_EAGERNESS = process.env.OPENAI_REALTIME_TURN_EAGERNESS ?? "low";
const TURN_THRESHOLD = Number(process.env.OPENAI_REALTIME_TURN_THRESHOLD ?? "0.6");
const TURN_PREFIX_PADDING_MS = Number(
  process.env.OPENAI_REALTIME_TURN_PREFIX_PADDING_MS ?? "450",
);
const TURN_SILENCE_MS = Number(process.env.OPENAI_REALTIME_TURN_SILENCE_MS ?? "900");

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY for Twilio realtime bridge.");
  process.exit(1);
}

const inventory = [
  "FPS-201: 2021 Toyota 8FBE20 electric, 2000kg, 4.8m mast, 1820 hours, GBP 14,950, Leeds.",
  "FPS-233: 2019 Linde H25D diesel, 2500kg, 4.7m mast, 4280 hours, GBP 12,900, Sheffield.",
  "FPS-247: 2020 Jungheinrich EFG 320 electric, 2000kg, 5.5m mast, 2360 hours, GBP 13,800, Bradford.",
  "FPS-251: 2018 Hyster H3.0FT LPG, 3000kg, 4.5m mast, 5125 hours, GBP 11,850, Wakefield.",
  "FPS-264: 2022 Doosan D35S-7 diesel, 3500kg, 4.9m mast, 1195 hours, GBP 18,400, Doncaster.",
].join("\n");

function buildInstructions(workspaceName, outboundContext = "") {
  return [
    `You are AEGIS, the live AI phone assistant for ${workspaceName}.`,
    "Speak in warm, natural British English with a polished but relaxed customer service tone.",
    "Sound conversational and human, never robotic, rushed, or over-enunciated.",
    "Keep replies very short, usually one sentence and under 16 words.",
    "Ask only one question at a time.",
    "Leave natural pauses and do not rush into a second sentence.",
    "If the caller is still speaking or thinking, wait rather than jumping in.",
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

function buildTurnDetection() {
  if (TURN_MODE === "server_vad") {
    return {
      type: "server_vad",
      threshold: TURN_THRESHOLD,
      prefix_padding_ms: TURN_PREFIX_PADDING_MS,
      silence_duration_ms: TURN_SILENCE_MS,
      create_response: true,
      interrupt_response: true,
    };
  }

  return {
    type: "semantic_vad",
    eagerness: TURN_EAGERNESS,
    create_response: true,
    interrupt_response: true,
  };
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
  let assistantSpeaking = false;
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

  openAiWs.on("open", () => {
    sendOpenAi({
      type: "session.update",
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: buildInstructions(callInfo.workspaceName, callInfo.outboundContext),
        turn_detection: buildTurnDetection(),
        output_modalities: ["audio"],
        audio: {
          input: {
            format: { type: "audio/pcmu" },
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

        assistantSpeaking = true;
        twilioWs.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: event.delta },
          }),
        );
        return;
      }

      if (
        (event.type === "response.output_audio.done" ||
          event.type === "response.audio.done" ||
          event.type === "response.done") &&
        assistantSpeaking
      ) {
        assistantSpeaking = false;
        return;
      }

      if (event.type === "input_audio_buffer.speech_started" && streamSid && assistantSpeaking) {
        if (twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        }
        assistantSpeaking = false;
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

  twilioWs.on("message", (message) => {
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

          sendOpenAi({
            type: "session.update",
            session: {
              instructions: buildInstructions(
                callInfo.workspaceName,
                callInfo.outboundContext,
              ),
              turn_detection: buildTurnDetection(),
              audio: {
                input: {
                  format: { type: "audio/pcmu" },
                },
                output: {
                  format: { type: "audio/pcmu" },
                  voice: REALTIME_VOICE,
                },
              },
            },
          });
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Twilio realtime bridge listening on http://127.0.0.1:${PORT}`);
});
