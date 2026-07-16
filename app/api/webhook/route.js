import { NextResponse } from "next/server";
import { sendWhatsAppMessage, sendWhatsAppList } from "../../../utils/whatsapp.js";
import { getGymAssistantResponse } from "../../../utils/gemini.js";
import { supabase } from "../../../utils/supabase.js";
import {
  MAIN_MENU_ROWS,
  SUPPORT_MENU_ROWS,
  MENU_TRIGGER_WORDS,
  INVALID_SELECTION_TEXT,
} from "../../../utils/gymContent.js";
import {
  resolveMainMenuSelection,
  resolveSupportMenuSelection,
  buildMainMenuReply,
  buildSupportMenuReply,
} from "../../../utils/gymMenu.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

async function sendMainMenu(to) {
  await sendWhatsAppList(to, {
    headerText: "THE OM GYM 💪",
    bodyText: "Welcome! Please choose an option:",
    footerText: "Reply MENU anytime to see this again",
    buttonText: "Menu",
    rows: MAIN_MENU_ROWS,
  });
}

async function sendSupportMenu(to) {
  await sendWhatsAppList(to, {
    bodyText: "Choose an option below:",
    buttonText: "Support",
    rows: SUPPORT_MENU_ROWS,
  });
}

export async function POST(request) {
  const body = await request.json();

  if (body.object !== "whatsapp_business_account") {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        // Ensure this is a message event and not a status change (like "read")
        if (value && value.messages && value.messages[0]) {
          const message = value.messages[0];
          const senderPhone = message.from;
          const waMessageId = message.id;

          // Plain text vs a tap on one of our interactive list menus.
          const listReply = message.interactive?.list_reply;
          const messageText = message.text?.body ?? listReply?.title;
          const selectionId = listReply?.id ?? null;

          if (!messageText) continue; // Skip audio/images/unsupported types for now

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

          // Step C: Active Conversation Management (also carries menu state in `context`)
          let { data: conversation } = await supabase
            .from("conversations")
            .select("id, context")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("last_activity_at", { ascending: false })
            .limit(1)
            .single();

          const isNewConversation = !conversation;

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({ user_id: user.id })
              .select()
              .single();
            conversation = newConv;
          }

          // Step D: Structured menu flow, falling back to the LLM when idle.
          const awaiting = conversation.context?.awaiting || null;
          const normalizedText = messageText.trim().toLowerCase();
          let aiResponse;
          let nextContext = conversation.context || {};

          if (isNewConversation || MENU_TRIGGER_WORDS.includes(normalizedText)) {
            await sendMainMenu(senderPhone);
            aiResponse = "[Main menu sent]";
            nextContext = { awaiting: "main_menu" };
          } else if (awaiting === "main_menu") {
            const resolvedId = resolveMainMenuSelection(selectionId, messageText.trim());
            const reply = resolvedId
              ? await buildMainMenuReply(supabase, user.id, resolvedId)
              : null;

            if (!reply) {
              await sendWhatsAppMessage(senderPhone, INVALID_SELECTION_TEXT);
              aiResponse = INVALID_SELECTION_TEXT;
              // stay on main_menu so the next reply is still interpreted as a selection
            } else {
              await sendWhatsAppMessage(senderPhone, reply.text);
              aiResponse = reply.text;
              if (reply.showSupportMenu) {
                await sendSupportMenu(senderPhone);
                nextContext = { awaiting: "support_menu" };
              } else {
                nextContext = { awaiting: null };
              }
            }
          } else if (awaiting === "support_menu") {
            const resolvedId = resolveSupportMenuSelection(selectionId, messageText.trim());
            const replyText = resolvedId ? buildSupportMenuReply(resolvedId) : null;

            if (!replyText) {
              await sendWhatsAppMessage(senderPhone, INVALID_SELECTION_TEXT);
              aiResponse = INVALID_SELECTION_TEXT;
            } else {
              await sendWhatsAppMessage(senderPhone, replyText);
              aiResponse = replyText;
              nextContext = { awaiting: null };
            }
          } else {
            // Idle — no active menu flow, hand off to the free-form AI assistant.
            const contextText = `Member Name: ${user.name || "Friend"}. Let them know their profile is recognized.`;
            try {
              aiResponse = await getGymAssistantResponse(messageText, contextText);
            } catch (llmError) {
              console.error("LLM error:", llmError);
              aiResponse =
                "Sorry — I'm having trouble generating a reply right now. Please try again in a minute.";
            }
            await sendWhatsAppMessage(senderPhone, aiResponse);
          }

          // Step E: Persist conversation state + activity timestamp
          await supabase
            .from("conversations")
            .update({ last_activity_at: new Date().toISOString(), context: nextContext })
            .eq("id", conversation.id);

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

  // Ack Meta ONLY AFTER processing completes or fails gracefully
  // On Vercel, responding early can freeze process execution and swallow subsequent network requests/logs.
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
