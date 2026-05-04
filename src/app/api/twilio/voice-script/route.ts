export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const script =
    searchParams.get("script") ??
    "Hello, this is AEGIS calling with a quote follow up. Please leave a message after the tone.";
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${script}</Say><Pause length="1"/><Record timeout="3" maxLength="30"/></Response>`,
    {
      headers: {
        "Content-Type": "text/xml",
      },
    },
  );
}
