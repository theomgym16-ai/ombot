import {
  MAIN_MENU_ROWS,
  SUPPORT_MENU_ROWS,
  PREMIUM_BENEFITS_TEXT,
  GYM_TIMINGS_TEXT,
  FREE_TRIAL_TEXT,
  JOIN_NOW_TEXT,
  PERSONAL_TRAINING_TEXT,
  DIET_PLANS_TEXT,
  LOCATION_TEXT,
  CONTACT_STAFF_TEXT,
  EXISTING_MEMBER_SUPPORT_TEXT,
  SUPPORT_RESPONSES,
} from "./gymContent.js";

// Grounds the free-form LLM assistant in the same real facts the menu uses,
// so it answers plan/timing/location/contact questions correctly instead of
// guessing when a user asks outside the structured menu flow.
export async function buildKnownFactsText(supabase) {
  const plansText = await buildMembershipPlansText(supabase);
  return [
    plansText,
    GYM_TIMINGS_TEXT,
    LOCATION_TEXT,
    CONTACT_STAFF_TEXT,
    JOIN_NOW_TEXT,
    FREE_TRIAL_TEXT,
    PERSONAL_TRAINING_TEXT,
    DIET_PLANS_TEXT,
  ].join("\n\n");
}

function durationLabel(days) {
  if (days === 30) return "1 Month";
  if (days === 90) return "3 Months";
  if (days % 30 === 0) return `${days / 30} Months`;
  return `${days} days`;
}

async function buildMembershipPlansText(supabase) {
  const { data: plans, error } = await supabase
    .from("plans")
    .select("name, price, duration_days, features")
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (error || !plans || plans.length === 0) {
    return "🏋️ Membership Plans\n\nOur plans aren't available right now — please contact staff for pricing.";
  }

  const withCardio = plans.filter((p) => p.features?.cardio);
  const withoutCardio = plans.filter((p) => !p.features?.cardio);

  const formatGroup = (list) =>
    list.map((p) => `* ${durationLabel(p.duration_days)} – ₹${p.price}`).join("\n");

  const sections = [];
  if (withoutCardio.length) {
    sections.push(`💪 Without Cardio\n${formatGroup(withoutCardio)}`);
  }
  if (withCardio.length) {
    sections.push(`🏃 With Cardio\n${formatGroup(withCardio)}`);
  }

  return `🏋️ Membership Plans\n\n${sections.join("\n\n")}\n\n${PREMIUM_BENEFITS_TEXT}`;
}

async function buildProgressText(supabase, userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentAttendance } = await supabase
    .from("attendance_logs")
    .select("check_in_time")
    .eq("user_id", userId)
    .gte("check_in_time", thirtyDaysAgo.toISOString())
    .order("check_in_time", { ascending: false });

  const { data: lastWorkout } = await supabase
    .from("workout_sessions")
    .select("muscle_groups, logged_at")
    .eq("user_id", userId)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const checkInCount = recentAttendance?.length || 0;

  if (checkInCount === 0 && !lastWorkout) {
    return "📊 Your Progress\n\nYou haven't logged any check-ins yet. Once you start training, message us after your workout and we'll track it here!";
  }

  const lastVisit = recentAttendance?.[0]?.check_in_time
    ? new Date(recentAttendance[0].check_in_time).toLocaleDateString()
    : "—";

  const lastWorkoutLine = lastWorkout
    ? `Last workout: ${lastWorkout.muscle_groups?.join(", ") || "—"} (${new Date(lastWorkout.logged_at).toLocaleDateString()})`
    : "Last workout: —";

  return `📊 Your Progress\n\nCheck-ins (last 30 days): ${checkInCount}\nLast visit: ${lastVisit}\n${lastWorkoutLine}\n\nKeep messaging us your workouts and we'll keep this updated!`;
}

export function resolveRowSelection(rows, selectionId, numericText) {
  if (selectionId && rows.some((r) => r.id === selectionId)) return selectionId;

  const index = Number(numericText);
  if (Number.isInteger(index) && index >= 1 && index <= rows.length) {
    return rows[index - 1].id;
  }
  return null;
}

export function resolveMainMenuSelection(selectionId, numericText) {
  return resolveRowSelection(MAIN_MENU_ROWS, selectionId, numericText);
}

export function resolveSupportMenuSelection(selectionId, numericText) {
  return resolveRowSelection(SUPPORT_MENU_ROWS, selectionId, numericText);
}

// Returns { text, showSupportMenu } — showSupportMenu signals the caller to
// also send the support-options list message after this text.
export async function buildMainMenuReply(supabase, userId, resolvedId) {
  switch (resolvedId) {
    case "menu_plans":
      return { text: await buildMembershipPlansText(supabase) };
    case "menu_timings":
      return { text: GYM_TIMINGS_TEXT };
    case "menu_trial":
      return { text: FREE_TRIAL_TEXT };
    case "menu_join":
      return { text: JOIN_NOW_TEXT };
    case "menu_pt":
      return { text: PERSONAL_TRAINING_TEXT };
    case "menu_diet":
      return { text: DIET_PLANS_TEXT };
    case "menu_progress":
      return { text: await buildProgressText(supabase, userId) };
    case "menu_location":
      return { text: LOCATION_TEXT };
    case "menu_contact":
      return { text: CONTACT_STAFF_TEXT };
    case "menu_support":
      return { text: EXISTING_MEMBER_SUPPORT_TEXT, showSupportMenu: true };
    default:
      return null;
  }
}

export function buildSupportMenuReply(resolvedId) {
  return SUPPORT_RESPONSES[resolvedId] || null;
}
