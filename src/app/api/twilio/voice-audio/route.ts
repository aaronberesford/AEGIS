import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { env } from "@/lib/env";
import { toErrorResponse } from "@/lib/errors";
import { synthesizeSpeechBuffer } from "@/lib/services/openai";
import { workspaceById } from "@/lib/repository";
import {
  britishVoiceInstructions,
  decodeVoiceAudioPayload,
} from "@/lib/voice-sales-agent";

const CACHE_DIR = path.join(os.tmpdir(), "aegis-voice-cache");

async function cachePath(key: string) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, `${key}.mp3`);
}

async function getCachedAudio(key: string) {
  try {
    const filePath = await cachePath(key);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function setCachedAudio(key: string, bytes: Buffer) {
  const filePath = await cachePath(key);
  await fs.writeFile(filePath, bytes);
}

function cacheKeyFor(input: { sig: string; voice: string; instructions: string }) {
  return crypto
    .createHash("sha256")
    .update(`${input.sig}:${input.voice}:${input.instructions}`)
    .digest("hex");
}

async function synthesizeWithRetry(
  text: string,
  voice: string,
  instructions: string,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const audio = await synthesizeSpeechBuffer(text, {
        model: "gpt-4o-mini-tts",
        voice,
        format: "mp3",
        instructions,
      });

      if (audio) {
        return audio;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Speech synthesis failed.");
}

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
    const phoneVoice = env().openAiPhoneVoice;

    const fallbackWorkspace =
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
          name: phoneVoice,
          speed: 1,
          style: "British",
        },
      };
    const instructions = britishVoiceInstructions(fallbackWorkspace);
    const key = cacheKeyFor({
      sig: searchParams.get("sig") ?? "voice",
      voice: phoneVoice,
      instructions,
    });

    const cached = await getCachedAudio(key);
    const audio =
      cached ??
      (await synthesizeWithRetry(payload.text, phoneVoice, instructions));

    if (!audio) {
      return NextResponse.json({ error: "Speech audio unavailable in demo mode." }, { status: 400 });
    }

    if (!cached) {
      await setCachedAudio(key, audio);
    }

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
