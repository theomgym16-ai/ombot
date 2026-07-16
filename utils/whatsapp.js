import dotenv from "dotenv";
dotenv.config();

async function postToWhatsApp(payload) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const timeoutMs = Number(process.env.WHATSAPP_TIMEOUT_MS || 10000);

  if (!token) throw new Error("Missing WHATSAPP_TOKEN");
  if (!phoneNumberId) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");

  // WhatsApp Cloud API v17 or higher
  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(
        `WhatsApp send failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
      );
    }

    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWhatsAppMessage(to, body) {
  return postToWhatsApp({
    messaging_product: "whatsapp",
    to,
    text: { body },
  });
}

// Sends a pre-approved Message Template — the ONLY way to reach a user
// outside the 24-hour customer-service window (i.e. proactive reminders).
// Plain text (sendWhatsAppMessage) is rejected by Meta in that case.
// bodyParams: ordered strings mapped to the template's {{1}}, {{2}}, ... vars.
export async function sendWhatsAppTemplate(
  to,
  templateName,
  bodyParams = [],
  languageCode = "en",
) {
  return postToWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length
        ? [
            {
              type: "body",
              parameters: bodyParams.map((text) => ({ type: "text", text })),
            },
          ]
        : undefined,
    },
  });
}

// rows: [{ id, title, description? }] — WhatsApp caps row titles at 24 chars
// and descriptions at 72 chars, and 10 rows total across all sections.
export async function sendWhatsAppList(
  to,
  { headerText, bodyText, footerText, buttonText, rows },
) {
  return postToWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: headerText ? { type: "text", text: headerText } : undefined,
      body: { text: bodyText },
      footer: footerText ? { text: footerText } : undefined,
      action: {
        button: buttonText || "Menu",
        sections: [{ rows }],
      },
    },
  });
}
