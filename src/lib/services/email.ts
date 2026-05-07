import "server-only";

import nodemailer from "nodemailer";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

type SendWorkspaceEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
};

type PurchaseInvoiceEmailInput = {
  customerName: string;
  truckName: string;
  listingId: string | null;
  priceDisplay: string;
  buyerType: string;
  deliveryPostcode: string;
  truckLink: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  dueDate: string | null;
  summary: string;
};

export function canSendWorkspaceEmail() {
  const settings = env();
  return Boolean(settings.gmailFromAddress && settings.gmailAppPassword);
}

function getTransport() {
  const settings = env();
  if (!settings.gmailFromAddress || !settings.gmailAppPassword) {
    throw new AppError("Gmail sending is not configured.", {
      code: "GMAIL_NOT_CONFIGURED",
      status: 500,
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: settings.gmailFromAddress,
      pass: settings.gmailAppPassword,
    },
  });
}

export async function sendWorkspaceEmail(input: SendWorkspaceEmailInput) {
  const settings = env();
  const transport = getTransport();

  try {
    return await transport.sendMail({
      from: `"${settings.gmailSenderName}" <${settings.gmailFromAddress}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? undefined,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Unable to send workspace email.",
      {
        code: "EMAIL_SEND_FAILED",
        status: 502,
      },
    );
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDueDate(value: string | null) {
  if (!value) {
    return "To be confirmed";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function buildPurchaseInvoiceEmail(input: PurchaseInvoiceEmailInput) {
  const dueDate = formatDueDate(input.dueDate);
  const listingLine = input.listingId ? `Truck reference: ${input.listingId}` : "Truck reference to confirm";
  const linkLine = input.truckLink ? `View truck: ${input.truckLink}` : "Truck link to be confirmed";
  const invoiceLine = input.invoiceNumber
    ? `Invoice number: ${input.invoiceNumber}`
    : "Invoice number will be confirmed by the sales team";

  const text = [
    `Hi ${input.customerName},`,
    "",
    `Thanks for speaking with AEGIS about ${input.truckName}.`,
    listingLine,
    `Quoted price: ${input.priceDisplay}`,
    `Purchase type: ${input.buyerType}`,
    `Delivery postcode: ${input.deliveryPostcode}`,
    invoiceLine,
    `Invoice status: ${input.invoiceStatus ?? "Draft"}`,
    `Invoice due date: ${dueDate}`,
    linkLine,
    "",
    `Call summary: ${input.summary}`,
    "",
    "If you are ready to proceed, reply to this email and our team will confirm the next payment step.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:24px;color:#111827">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
        <div style="background:#111111;color:#ffffff;padding:28px 32px">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#ef4444;margin-bottom:12px">Forklift Pro Solutions</div>
          <div style="font-size:32px;font-weight:800;line-height:1.05;margin:0 0 8px">${escapeHtml(input.truckName)}</div>
          <div style="font-size:16px;opacity:0.9">Purchase summary and invoice details</div>
        </div>
        <div style="padding:28px 32px">
          <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(input.customerName)},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7">
            Thanks for speaking with AEGIS. We have prepared your purchase summary and draft invoice details below.
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Truck</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(input.truckName)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Reference</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(input.listingId ?? "To confirm")}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Price</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(input.priceDisplay)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Purchase type</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(input.buyerType)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Delivery postcode</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(input.deliveryPostcode)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Invoice number</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(input.invoiceNumber ?? "Pending")}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Invoice status</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(input.invoiceStatus ?? "Draft")}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700">Due date</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(dueDate)}</td></tr>
          </table>
          ${
            input.truckLink
              ? `<p style="margin:0 0 20px"><a href="${escapeHtml(input.truckLink)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">View truck details</a></p>`
              : ""
          }
          <p style="margin:0 0 12px;font-size:14px;line-height:1.7"><strong>Call summary:</strong> ${escapeHtml(input.summary)}</p>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#4b5563">
            Reply to this email if you want the team to confirm the next payment step or final delivery details.
          </p>
        </div>
      </div>
    </div>
  `.trim();

  const attachment = `
Forklift Pro Solutions
Purchase Summary / Invoice

Customer: ${input.customerName}
Truck: ${input.truckName}
Reference: ${input.listingId ?? "To confirm"}
Price: ${input.priceDisplay}
Purchase type: ${input.buyerType}
Delivery postcode: ${input.deliveryPostcode}
Invoice number: ${input.invoiceNumber ?? "Pending"}
Invoice status: ${input.invoiceStatus ?? "Draft"}
Invoice due date: ${dueDate}
Truck link: ${input.truckLink ?? "To be confirmed"}

Call summary:
${input.summary}
  `.trim();

  return { text, html, attachment };
}
