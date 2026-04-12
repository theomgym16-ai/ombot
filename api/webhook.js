import { sendWhatsAppMessage } from "../utils/whatsapp.js";
import { getGymAssistantResponse } from "../utils/gemini.js";
import { supabase } from "../utils/supabase.js";

export default async function handler(req, res) {
  // ==========================================
  // 1. WEBHOOK VERIFICATION (By Meta)
  // ==========================================
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // ==========================================
  // 2. PROCESS INCOMING MESSAGES
  // ==========================================
  if (req.method === "POST") {
    const body = req.body;

    // Validate that the request came from Meta
    if (body.object === "whatsapp_business_account") {
      // Ack immediately so Meta doesn't retry; continue work after responding.
      res.status(200).send("EVENT_RECEIVED");

      try {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            const value = change.value;
            // Ensure this is a message event and not a status change (like "read")
            if (value && value.messages && value.messages[0]) {
              const message = value.messages[0];
              const senderPhone = message.from;
              const messageText = message.text?.body;
              const waMessageId = message.id;

              if (!messageText) continue; // Skip audio/images for now

              // Step A: Deduplication (Meta aggressively retries webhooks if no 200 OK is sent immediately)
              const { data: existingLog } = await supabase
                .from("message_logs")
                .select("id")
                .eq("wa_message_id", waMessageId)
                .single();

              if (existingLog) continue; // Already processed this message

              // Step B: Identify User in Database
              let { data: user } = await supabase
                .from("users")
                .select("id, name")
                .eq("phone_number", senderPhone)
                .single();

              if (!user) {
                // If member isn't in DB yet, create a barebones profile
                const { data: newUser, error: createError } = await supabase
                  .from("users")
                  .insert({ phone_number: senderPhone, name: "Guest" })
                  .select()
                  .single();

                if (createError) throw createError;
                user = newUser;
              }

              // Step C: Active Conversation Management for AI Context
              let { data: conversation } = await supabase
                .from("conversations")
                .select("id")
                .eq("user_id", user.id)
                .eq("status", "active")
                .order("last_activity_at", { ascending: false })
                .limit(1)
                .single();

              if (!conversation) {
                const { data: newConv } = await supabase
                  .from("conversations")
                  .insert({ user_id: user.id })
                  .select()
                  .single();
                conversation = newConv;
              } else {
                await supabase
                  .from("conversations")
                  .update({ last_activity_at: new Date().toISOString() })
                  .eq("id", conversation.id);
              }

              // Step D: Request LLM Output
              const context = `Member Name: ${user.name || "Friend"}. Let them know their profile is recognized.`;
              let aiResponse;
              try {
                aiResponse = await getGymAssistantResponse(
                  messageText,
                  context,
                );
              } catch (llmError) {
                console.error("LLM error:", llmError);
                aiResponse =
                  "Sorry — I'm having trouble generating a reply right now. Please try again in a minute.";
              }

              // Step E: Send WhatsApp Message Back
              await sendWhatsAppMessage(senderPhone, aiResponse);

              // Step F: Log Transcription (both sides)
              await supabase.from("message_logs").insert([
                {
                  conversation_id: conversation.id,
                  user_id: user.id,
                  direction: "inbound",
                  content: messageText,
                  wa_message_id: waMessageId,
                },
                {
                  conversation_id: conversation.id,
                  user_id: user.id,
                  direction: "outbound",
                  content: aiResponse,
                },
              ]);
            }
          }
        }
      } catch (error) {
        console.error("Webhook processing error:", error);
      }

      return;
    }

    return res.status(404).send("Not Found");
  }

  return res.status(405).send("Method Not Allowed");
}
