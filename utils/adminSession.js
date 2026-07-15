import { SignJWT, jwtVerify } from "jose";

export const ADMIN_SESSION_COOKIE = "ohm_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

function getSecretKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Missing/weak ADMIN_SESSION_SECRET. Set it to a random string of at least 32 characters.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(admin) {
  return new SignJWT({ sub: admin.id, username: admin.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
