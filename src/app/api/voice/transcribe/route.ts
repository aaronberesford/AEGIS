import { NextResponse } from "next/server";

import { addAuditLog } from "@/lib/demo-store";
import { processAgentTurn } from "@/lib/agent-runtime";
import { toErrorResponse } from "@/lib/errors";
import { transcribeAudio } from "@/lib/services/openai";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const workspaceId = String(form.get("workspaceId") ?? "ws_forklift");
    const userId = String(form.get("userId") ?? "user_alex");

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const transcript =
      (await transcribeAudio(audio)) ??
      "Call this lead and follow up on their quote.";

    addAuditLog({
      workspaceId,
      userId,
      action: "voice_transcription",
      input: "audio/webm",
      output: transcript,
      approvalStatus: "not_required",
    });

    const payload = await processAgentTurn({
      workspaceId,
      userId,
      message: transcript,
      transcript,
      includeSpeech: true,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
