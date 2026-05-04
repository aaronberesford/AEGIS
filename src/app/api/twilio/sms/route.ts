import { findWorkspaceByTwilioNumber, logSmsActivity } from "@/lib/repository";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const to = String(formData.get("To") ?? "");
  const body = String(formData.get("Body") ?? "");

  const workspace = to ? await findWorkspaceByTwilioNumber(to) : null;

  if (workspace) {
    await logSmsActivity({
      workspaceId: workspace.id,
      direction: "inbound",
      messageBody: body || "Inbound SMS received.",
    });
  }

  const reply = workspace
    ? `Thanks, this is AEGIS for ${workspace.name}. We've logged your message and will review it shortly.`
    : "Thanks, your message has been received by AEGIS.";

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`,
    {
      headers: {
        "Content-Type": "text/xml",
      },
    },
  );
}
