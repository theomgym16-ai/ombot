import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase.js";
import { sendWhatsAppTemplate } from "../../../../utils/whatsapp.js";
import { getDueReminders } from "../../../../utils/reminders.js";

export const dynamic = "force-dynamic";

const TEMPLATE_NAME = process.env.WHATSAPP_REMINDER_TEMPLATE || "membership_reminder";
const TEMPLATE_LANG = process.env.WHATSAPP_REMINDER_TEMPLATE_LANG || "en";

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when
// CRON_SECRET is set. This route is under /api/* which proxy.js does NOT gate,
// so it must guard itself — otherwise anyone could trigger a broadcast.
function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: no secret configured = no proactive sends
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  let due;
  try {
    due = await getDueReminders(supabase);
  } catch (error) {
    console.error("expiry-check: query failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Drop anything already delivered (the reminders_sent UNIQUE constraint is
  // still the real guard on the send path — this just avoids needless work
  // and gives an accurate target count / dry-run preview).
  if (due.length > 0) {
    const subIds = due.map((d) => d.subscription.id);
    const { data: alreadySent, error: sentErr } = await supabase
      .from("reminders_sent")
      .select("subscription_id, reminder_type")
      .in("subscription_id", subIds);

    if (sentErr) {
      // Missing table: tolerable for a dry-run preview (bucketing still works),
      // but never for a real send — we won't broadcast without the dedupe guard.
      const tableMissing = sentErr.code === "42P01" || sentErr.code === "PGRST205";
      if (!(dryRun && tableMissing)) {
        console.error("expiry-check: reminders_sent lookup failed", sentErr);
        return NextResponse.json({ error: sentErr.message }, { status: 500 });
      }
    } else {
      const sentKeys = new Set(
        (alreadySent || []).map((r) => `${r.subscription_id}:${r.reminder_type}`),
      );
      due = due.filter((d) => !sentKeys.has(`${d.subscription.id}:${d.reminderType}`));
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      template: TEMPLATE_NAME,
      count: due.length,
      recipients: due.map((d) => ({
        name: d.user.name,
        phone: d.user.phone_number,
        reminderType: d.reminderType,
        timingPhrase: d.timingPhrase,
      })),
    });
  }

  const byType = { expiry_3d: [], expiry_1d: [], expired: [] };
  const failedNumbers = [];
  let sent = 0;

  for (const item of due) {
    const { subscription, user, reminderType, timingPhrase } = item;

    // Claim the slot first so a crash after send can't double-send, and
    // concurrent runs can't both send (UNIQUE violation → treat as taken).
    const { error: claimErr } = await supabase
      .from("reminders_sent")
      .insert({ subscription_id: subscription.id, reminder_type: reminderType });

    if (claimErr) {
      if (claimErr.code === "23505") continue; // already sent by another run
      console.error("expiry-check: claim failed", claimErr);
      failedNumbers.push(user.phone_number);
      byType[reminderType]?.push("fail");
      continue;
    }

    try {
      await sendWhatsAppTemplate(
        user.phone_number,
        TEMPLATE_NAME,
        [user.name || "there", timingPhrase],
        TEMPLATE_LANG,
      );
      sent += 1;
      byType[reminderType]?.push("ok");
    } catch (sendErr) {
      // Roll back the claim so the next daily run retries this member.
      await supabase
        .from("reminders_sent")
        .delete()
        .eq("subscription_id", subscription.id)
        .eq("reminder_type", reminderType);
      console.error("expiry-check: send failed", user.phone_number, sendErr.message);
      failedNumbers.push(user.phone_number);
      byType[reminderType]?.push("fail");
    }
  }

  // Audit trail: one broadcast_jobs row per reminder bucket that had targets.
  const jobRows = [];
  for (const [reminderType, results] of Object.entries(byType)) {
    if (results.length === 0) continue;
    const failedCount = results.filter((r) => r === "fail").length;
    jobRows.push({
      job_type: `expiry_alert_${reminderType}`,
      status: failedCount === results.length ? "failed" : "completed",
      target_count: results.length,
      sent_count: results.length - failedCount,
      failed_count: failedCount,
      filters: { reminder_type: reminderType },
      results: { failed_numbers: failedNumbers },
      completed_at: new Date().toISOString(),
    });
  }
  if (jobRows.length > 0) {
    await supabase.from("broadcast_jobs").insert(jobRows);
  }

  return NextResponse.json({
    ok: true,
    processed: due.length,
    sent,
    failed: failedNumbers.length,
  });
}
