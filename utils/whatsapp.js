import dotenv from "dotenv";
dotenv.config();

export async function sendWhatsAppMessage(to, body) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const timeoutMs = Number(process.env.WHATSAPP_TIMEOUT_MS || 10000);

  if (!token) throw new Error("Missing WHATSAPP_TOKEN");
  if (!phoneNumberId) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");

  // WhatsApp Cloud API v17 or higher
  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: to,
    text: { body: body },
  };

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
