import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase.js";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE,
} from "../../../../utils/adminSession.js";

async function requireAdminSession(request) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return token ? await verifySessionToken(token) : null;
}

export async function POST(request) {
  const session = await requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phoneDigits =
    typeof body.phone_number === "string" ? body.phone_number.replace(/\D/g, "") : "";
  const joinDate = typeof body.join_date === "string" ? body.join_date : "";
  const planId = typeof body.plan_id === "string" ? body.plan_id : "";

  if (!name || !phoneDigits || !joinDate || !planId) {
    return NextResponse.json(
      { error: "Name, phone number, join date, and plan are all required." },
      { status: 400 },
    );
  }

  const startDate = new Date(joinDate);
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid join date." }, { status: 400 });
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, duration_days, price")
    .eq("id", planId)
    .eq("is_active", true)
    .single();

  if (planError || !plan) {
    return NextResponse.json({ error: "Selected plan was not found." }, { status: 400 });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert(
      { phone_number: phoneDigits, name, role: "member", status: "active" },
      { onConflict: "phone_number" },
    )
    .select("id")
    .single();

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message || "Failed to create member." },
      { status: 500 },
    );
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.duration_days);

  const { error: subError } = await supabase.from("subscriptions").insert({
    user_id: user.id,
    plan_id: plan.id,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    amount_paid: plan.price,
    status: "active",
  });

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
