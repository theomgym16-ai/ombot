import dotenv from 'dotenv';
dotenv.config();

export async function sendWhatsAppMessage(to, body) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // WhatsApp Cloud API v17 or higher
  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    to: to,
    text: { body: body }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}
