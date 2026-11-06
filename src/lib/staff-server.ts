import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { readSession } from "./session-token";

export const SESSION_COOKIE = "bb_staff";
export type Staff = {
  id: string;
  username: string;
  role: "admin" | "barista" | "counter";
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new HttpError(
      503,
      "Staff service is not configured. Ask the booth lead to finish setup.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function sessionSecret() {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(
      503,
      "Staff sign-in is not configured. Ask the booth lead to finish setup.",
    );
  return secret;
}
export async function staffSession(): Promise<Staff | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = readSession(token, sessionSecret());
  if (!id) return null;
  const { data, error } = await database()
    .from("staff")
    .select("id, username, role")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error)
    throw new HttpError(
      503,
      "Cannot verify staff access. Try again when connected.",
    );
  if (!data || !["barista", "admin", "counter"].includes(data.role))
    return null;
  return data as Staff;
}
export async function requireStaff() {
  const staff = await staffSession();
  if (!staff)
    throw new HttpError(
      401,
      "Your session ended. Sign in again; your draft is retained.",
    );
  return staff;
}
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403, "Open this app directly and try again.");
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Send a JSON request.");
  const text = await request.text();
  if (text.length > 30000)
    throw new HttpError(413, "This request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid request. Reload and try again.");
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "Cannot reach the staff service. Your changes are retained; try again.",
    },
    error instanceof HttpError ? error.status : 503,
  );
}
