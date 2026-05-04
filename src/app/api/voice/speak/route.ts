import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { synthesizeSpeech } from "@/lib/services/openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; voice?: string };

    if (!body.text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const audioBase64 = await synthesizeSpeech(body.text, body.voice);

    return NextResponse.json({
      audioBase64,
      mimeType: audioBase64 ? "audio/mpeg" : null,
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
