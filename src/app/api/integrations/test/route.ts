import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { testOpenAiConnection } from "@/lib/services/openai";
import { testTwilioConnection } from "@/lib/services/twilio";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: "openai" | "twilio";
    };

    if (!body.provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    const result =
      body.provider === "openai"
        ? await testOpenAiConnection()
        : await testTwilioConnection();

    return NextResponse.json(result);
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
