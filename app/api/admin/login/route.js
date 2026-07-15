import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "../../../../utils/supabase.js";
import {
  createSessionToken,
  ADMIN_SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "../../../../utils/adminSession.js";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
// Fixed dummy hash so a lookup for a non-existent username still pays the
// bcrypt cost — keeps response timing indistinguishable from a real user.
const DUMMY_HASH =
  "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q8N0K2P8v3ZQ0T0F0aXn1O5s7g7Xu";

function genericError() {
  return NextResponse.json(
    { error: "Invalid username or password." },
    { status: 401 },
  );
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("id, username, password_hash, failed_attempts, locked_until")
    .eq("username", username)
    .single();

  if (!admin) {
    await bcrypt.compare(password, DUMMY_HASH);
    return genericError();
  }

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    return NextResponse.json(
      { error: "Account temporarily locked due to failed attempts. Try again later." },
      { status: 429 },
    );
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);

  if (!passwordMatches) {
    const failedAttempts = admin.failed_attempts + 1;
    const lockedUntil =
      failedAttempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
        : null;

    await supabase
      .from("admins")
      .update({ failed_attempts: failedAttempts, locked_until: lockedUntil })
      .eq("id", admin.id);

    return genericError();
  }

  await supabase
    .from("admins")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", admin.id);

  const token = await createSessionToken(admin);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
