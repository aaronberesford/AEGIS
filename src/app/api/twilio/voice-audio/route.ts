import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { synthesizeSpeechBuffer } from "@/lib/services/openai";
import { workspaceById } from "@/lib/repository";
import {
  britishVoiceInstructions,
  decodeVoiceAudioPayload,
} from "@/lib/voice-sales-agent";

const DEFAULT_VOICE = "verse";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = decodeVoiceAudioPayload(
      searchParams.get("payload"),
      searchParams.get("sig"),
    );

    if (!payload) {
      return NextResponse.json({ error: "Invalid voice payload." }, { status: 400 });
    }

    const workspace = await workspaceById(payload.workspaceId);
    const preferredVoice =
      workspace?.voice.name && workspace.voice.name !== "alloy"
        ? workspace.voice.name
        : DEFAULT_VOICE;

    const audio = await synthesizeSpeechBuffer(payload.text, {
      model: "gpt-4o-mini-tts",
      voice: preferredVoice,
      format: "wav",
      instructions: britishVoiceInstructions(
        workspace ?? {
          id: payload.workspaceId,
          name: "AEGIS",
          industry: "Operations",
          toneOfVoice: "Warm and direct",
          services: [],
          targetCustomers: [],
          twilioNumber: "",
          openAiModel: "gpt-5-mini",
          crmProvider: "",
          emailProvider: "",
          websiteProvider: "",
          businessHours: "",
          approvalPolicy: "",
          voice: {
            name: preferredVoice,
            speed: 1,
            style: "British",
          },
        },
      ),
    });

    if (!audio) {
      return NextResponse.json({ error: "Speech audio unavailable in demo mode." }, { status: 400 });
    }

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
