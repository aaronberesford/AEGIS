import "server-only";

export function env() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const defaultMediaStreamUrl = appUrl.startsWith("https://")
    ? `${appUrl.replace("https://", "wss://")}/media-stream`
    : `${appUrl.replace("http://", "ws://")}/media-stream`;
  const releaseVersion =
    process.env.AEGIS_RELEASE_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RENDER_GIT_COMMIT ??
    "local-dev";

  return {
    demoMode: process.env.DEMO_MODE !== "false",
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    openAiSpeechModel: process.env.OPENAI_SPEECH_MODEL ?? "gpt-4o-mini-tts",
    openAiRealtimeModel: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-1.5",
    openAiRealtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? "cedar",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER ?? "",
    twilioRealtimeEnabled: process.env.TWILIO_REALTIME_ENABLED === "true",
    twilioMediaStreamUrl:
      process.env.TWILIO_MEDIA_STREAM_URL ?? defaultMediaStreamUrl,
    twilioMediaStreamPort: Number(process.env.TWILIO_MEDIA_STREAM_PORT ?? "3001"),
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    base44AppId: process.env.BASE44_APP_ID ?? "",
    base44ApiKey: process.env.BASE44_API_KEY ?? "",
    base44WorkspaceId: process.env.BASE44_WORKSPACE_ID ?? "",
    forkliftWebsiteBaseUrl: process.env.FORKLIFT_WEBSITE_BASE_URL ?? "",
    gmailFromAddress: process.env.GMAIL_FROM_ADDRESS ?? "",
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD ?? "",
    gmailSenderName: process.env.GMAIL_SENDER_NAME ?? "Forklift Pro Solutions",
    aegisPhoneSyncSecret: process.env.AEGIS_PHONE_SYNC_SECRET ?? "",
    releaseVersion,
    appUrl,
  };
}
