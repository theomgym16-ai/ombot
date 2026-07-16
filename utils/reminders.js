// Pure query/bucket logic for the proactive expiry-reminder cron.
// Kept separate from the route handler so it can be exercised without
// actually sending WhatsApp messages (see ?dryRun=1 on the cron route).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // gym is in India; buckets are IST calendar days
const EXPIRED_LOOKBACK_DAYS = 14; // don't chase members who lapsed long ago

// Whole calendar-day difference (end_date − now) measured in IST, so a
// membership ending "tomorrow" is exactly 1 regardless of clock time.
function daysUntilIST(endDate, now = new Date()) {
  const toISTMidnight = (d) => {
    const shifted = new Date(d.getTime() + IST_OFFSET_MS);
    return Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    );
  };
  return Math.round((toISTMidnight(endDate) - toISTMidnight(now)) / 86400000);
}

function formatDateIST(endDate) {
  return endDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

// Maps a subscription's remaining days to a reminder bucket, or null if it
// falls in no bucket. Exported for unit-style testing.
export function computeBucket(endDate, now = new Date()) {
  const days = daysUntilIST(endDate, now);
  const when = formatDateIST(endDate);

  if (days === 3) return { reminderType: "expiry_3d", timingPhrase: `expires in 3 days (${when})` };
  if (days === 1) return { reminderType: "expiry_1d", timingPhrase: `expires tomorrow (${when})` };
  if (days < 0 && days >= -EXPIRED_LOOKBACK_DAYS)
    return { reminderType: "expired", timingPhrase: `expired on ${when}` };
  return null;
}

// Returns [{ user, subscription, reminderType, timingPhrase }] for every
// active member whose *latest* active subscription lands in a bucket.
// Using the furthest-out (MAX end_date) active subscription per user means
// early-renewers are correctly skipped — their newest row pushes the date
// past every window. Mirrors the latestSubByUser pattern in app/admin/page.js.
export async function getDueReminders(supabase, now = new Date()) {
  const { data: subscriptions, error: subsError } = await supabase
    .from("subscriptions")
    .select("id, user_id, end_date")
    .eq("status", "active")
    .order("end_date", { ascending: false });

  if (subsError) throw subsError;

  const latestSubByUser = new Map();
  for (const sub of subscriptions) {
    if (!latestSubByUser.has(sub.user_id)) {
      latestSubByUser.set(sub.user_id, sub);
    }
  }

  if (latestSubByUser.size === 0) return [];

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name, phone_number, status")
    .in("id", [...latestSubByUser.keys()])
    .eq("status", "active");

  if (usersError) throw usersError;

  const due = [];
  for (const user of users) {
    const sub = latestSubByUser.get(user.id);
    if (!sub) continue;
    const bucket = computeBucket(new Date(sub.end_date), now);
    if (!bucket) continue;
    due.push({ user, subscription: sub, ...bucket });
  }
  return due;
}
