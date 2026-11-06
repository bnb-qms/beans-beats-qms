import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import {
  body,
  checkOrigin,
  database,
  failure,
  HttpError,
  json,
  sessionSecret,
  SESSION_COOKIE,
  staffSession,
} from "@/lib/staff-server";
import { signSession } from "@/lib/session-token";

export async function GET() {
  try {
    return json({ staff: await staffSession() });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = await body(request);
    if (
      typeof input?.username !== "string" ||
      !input.username.trim() ||
      input.username.length > 100 ||
      typeof input.password !== "string" ||
      !input.password ||
      input.password.length > 200
    )
      throw new HttpError(400, "Enter your staff username and password.");
    const secret = sessionSecret();
    const db = database();
    const key = createHmac("sha256", secret)
      .update(input.username.trim().toLowerCase())
      .digest("hex");
    const limit = await db.rpc("counter_login_attempt", { p_key: key });
    if (limit.error)
      throw new HttpError(
        503,
        "Sign-in is unavailable. Ask the booth lead to check setup.",
      );
    if (!limit.data)
      throw new HttpError(
        429,
        "Too many sign-in attempts. Wait 15 minutes and try again.",
      );
    const { data, error } = await db.rpc("verify_staff_credentials", {
      p_username: input.username.trim(),
      p_password: input.password,
    });
    if (error)
      throw new HttpError(
        503,
        "Sign-in is unavailable. Try again when connected.",
      );
    const staff = data?.[0];
    if (!staff || !["admin", "barista", "counter"].includes(staff.role))
      throw new HttpError(401, "Username or password not recognised.");
    (await cookies()).set(SESSION_COOKIE, signSession(staff.id, secret), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60,
      path: "/",
    });
    return json({ staff });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    (await cookies()).delete(SESSION_COOKIE);
    return json({ signedOut: true });
  } catch (e) {
    return failure(e);
  }
}
