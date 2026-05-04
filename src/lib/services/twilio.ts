import "server-only";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

function requireTwilioConfig() {
  const config = env();

  if (config.demoMode) {
    return config;
  }

  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
    throw new AppError("Twilio credentials are missing.", {
      code: "TWILIO_MISSING_KEY",
      status: 400,
    });
  }

  return config;
}

function authHeader() {
  const config = requireTwilioConfig();
  const value = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`,
  ).toString("base64");

  return `Basic ${value}`;
}

export async function sendTwilioSms(to: string, body: string) {
  const config = requireTwilioConfig();

  if (config.demoMode) {
    return { sid: "demo_sms", status: "queued" };
  }

  const form = new URLSearchParams({
    To: to,
    From: config.twilioPhoneNumber,
    Body: body,
  });

  const response = await fetch(
    `${TWILIO_BASE}/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`Twilio SMS failed: ${detail || response.status}`, {
      code: "TWILIO_SMS_FAILED",
      status: 502,
    });
  }

  return response.json();
}

export async function placeTwilioCall(to: string, twimlUrl: string) {
  const config = requireTwilioConfig();

  if (config.demoMode) {
    return { sid: "demo_call", status: "queued" };
  }

  const form = new URLSearchParams({
    To: to,
    From: config.twilioPhoneNumber,
    Url: twimlUrl,
  });

  const response = await fetch(
    `${TWILIO_BASE}/Accounts/${config.twilioAccountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`Twilio call failed: ${detail || response.status}`, {
      code: "TWILIO_CALL_FAILED",
      status: 502,
    });
  }

  return response.json();
}

export async function testTwilioConnection() {
  const config = requireTwilioConfig();

  if (config.demoMode) {
    return {
      ok: true,
      detail: "Demo mode is enabled. Twilio calls are mocked.",
    };
  }

  const response = await fetch(
    `${TWILIO_BASE}/Accounts/${config.twilioAccountSid}.json`,
    {
      headers: {
        Authorization: authHeader(),
      },
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`Twilio connection failed: ${detail || response.status}`, {
      code: "TWILIO_CONNECTION_FAILED",
      status: 502,
    });
  }

  return {
    ok: true,
    detail: `Twilio connection is valid for ${config.twilioPhoneNumber}.`,
  };
}
