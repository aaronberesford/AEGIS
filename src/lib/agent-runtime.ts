import "server-only";

import {
  appendConversationMessage,
  previewAgentAction,
  workspaceById,
} from "@/lib/demo-store";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { runAegisAgent } from "@/lib/agent";
import { synthesizeSpeech } from "@/lib/services/openai";

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function processAgentTurn(input: {
  workspaceId: string;
  userId: string;
  message: string;
  includeSpeech?: boolean;
  transcript?: string;
}) {
  const workspace = workspaceById(input.workspaceId);

  if (!workspace) {
    throw new AppError("Workspace not found.", {
      code: "WORKSPACE_NOT_FOUND",
      status: 404,
    });
  }

  const result = await runAegisAgent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    message: input.message,
  });

  previewAgentAction(result);
  appendConversationMessage(
    input.workspaceId,
    {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: input.message,
      timestamp: timestamp(),
    },
    {
      id: `msg_${Date.now()}_assistant`,
      role: "assistant",
      content: result.message,
      timestamp: timestamp(),
    },
  );

  const audioBase64 =
    input.includeSpeech && !env().demoMode
      ? await synthesizeSpeech(result.message, workspace.voice.name)
      : null;

  return {
    transcript: input.transcript ?? input.message,
    assistantMessage: result.message,
    actionCards: result.actionCards,
    audioBase64,
    mimeType: audioBase64 ? "audio/mpeg" : null,
    speechAvailable: !env().demoMode && !!env().openAiApiKey,
  };
}
