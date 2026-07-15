import { NextResponse } from "next/server";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE,
} from "./utils/adminSession.js";

export async function proxy(request) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
