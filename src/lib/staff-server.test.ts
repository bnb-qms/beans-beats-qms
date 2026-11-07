import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => mocks }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import {
  body,
  checkOrigin,
  database,
  failure,
  HttpError,
  json,
  requireStaff,
  SESSION_COOKIE,
  sessionSecret,
  staffSession,
} from "./staff-server";
import { signSession } from "./session-token";

const secret = "boundary-test-secret-at-least-32-chars";
const staff = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "test",
  role: "barista",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STAFF_SESSION_SECRET", secret);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: staff, error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

// A stand-in for a write handler: it must never run when the boundary rejects.
const write = vi.fn();
async function guardedWrite(request: Request) {
  checkOrigin(request);
  await requireStaff();
  await body(request);
  await write();
}
const patchRequest = (
  origin = "https://booth.test",
  input: unknown = { ok: true },
) =>
  new Request("https://booth.test/api/counter/orders", {
    method: "PATCH",
    headers: {
      origin,
      host: "booth.test",
      cookie: `bb_staff=${signSession(staff.id, secret)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

it("denies missing, forged and expired sessions before any data access", async () => {
  for (const value of [
    undefined,
    "forged-token",
    signSession(staff.id, secret, Date.now() - 43200001),
    signSession(staff.id, "wrong-secret-at-least-32-chars-long"),
  ]) {
    mocks.get.mockReturnValue(value ? { value } : undefined);
    expect(await staffSession()).toBeNull();
    await expect(requireStaff()).rejects.toMatchObject({
      status: 401,
      message: "Your session ended. Sign in again; your draft is retained.",
    });
  }
  expect(mocks.from).not.toHaveBeenCalled();
});

it("denies revoked staff and unrecognised roles while still rechecking the database", async () => {
  mocks.get.mockReturnValue({ value: signSession(staff.id, secret) });
  expect(await staffSession()).toEqual(staff);
  for (const data of [null, { ...staff, role: "guest" }]) {
    // Two calls: staffSession() and requireStaff() each recheck the database.
    mocks.maybeSingle.mockResolvedValueOnce({ data, error: null });
    mocks.maybeSingle.mockResolvedValueOnce({ data, error: null });
    expect(await staffSession()).toBeNull();
    await expect(requireStaff()).rejects.toMatchObject({ status: 401 });
  }
  expect(mocks.from).toHaveBeenCalled();
});

it("surfaces database failures as a safe 503 without leaking detail", async () => {
  mocks.get.mockReturnValue({ value: signSession(staff.id, secret) });
  mocks.maybeSingle.mockResolvedValue({
    data: null,
    error: { message: "relation public.staff does not exist" },
  });
  const caught = await staffSession().catch((e) => e);
  expect(caught).toMatchObject({ status: 503 });
  const safe = await failure(caught).json();
  expect(safe).toEqual({
    error: "Cannot verify staff access. Try again when connected.",
  });
});

it("rejects cross-origin and origin-less writes without touching the session or data", async () => {
  await expect(
    guardedWrite(patchRequest("https://other.test")),
  ).rejects.toMatchObject({ status: 403 });
  const noOrigin = new Request("https://booth.test/api/counter/orders", {
    method: "PATCH",
    headers: {
      host: "booth.test",
      cookie: `bb_staff=${signSession(staff.id, secret)}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  await expect(guardedWrite(noOrigin)).rejects.toMatchObject({ status: 403 });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

it("rejects wrong content types, oversized and malformed bodies before writing", async () => {
  const wrongType = new Request("https://booth.test/api/counter/orders", {
    method: "PATCH",
    headers: { origin: "https://booth.test", host: "booth.test" },
    body: "username=test&password=x",
  });
  await expect(body(wrongType)).rejects.toMatchObject({ status: 415 });
  const oversized = patchRequest("https://booth.test", {
    draft: "x".repeat(30001),
  });
  await expect(body(oversized)).rejects.toMatchObject({ status: 413 });
  const malformed = new Request("https://booth.test/api/counter/orders", {
    method: "PATCH",
    headers: {
      origin: "https://booth.test",
      host: "booth.test",
      "content-type": "application/json",
    },
    body: "{not json",
  });
  await expect(body(malformed)).rejects.toMatchObject({ status: 400 });
  expect(await body(patchRequest())).toEqual({ ok: true });
});

it("never mutates data on a rejected write: the write runs only on a fully accepted request", async () => {
  await expect(guardedWrite(patchRequest("https://other.test"))).rejects.toBeInstanceOf(HttpError);
  mocks.get.mockReturnValue(undefined);
  await expect(guardedWrite(patchRequest())).rejects.toMatchObject({
    status: 401,
  });
  expect(write).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  // A fully accepted request reaches the write exactly once.
  mocks.get.mockReturnValue({ value: signSession(staff.id, secret) });
  await guardedWrite(patchRequest());
  expect(write).toHaveBeenCalledTimes(1);
});

it("answers with no-store JSON and a safe generic message for unknown failures", async () => {
  const ok = json({ a: 1 });
  expect(ok.status).toBe(200);
  expect(ok.headers.get("Cache-Control")).toBe("no-store");
  expect(await ok.json()).toEqual({ a: 1 });
  const known = await failure(
    new HttpError(409, "This item changed since you started editing."),
  );
  expect(known.status).toBe(409);
  expect(await known.json()).toEqual({
    error: "This item changed since you started editing.",
  });
  const unknown = await failure(new Error("password=secret connection refused"));
  expect(unknown.status).toBe(503);
  expect(await unknown.json()).toEqual({
    error: "Cannot reach the staff service. Your changes are retained; try again.",
  });
});

it("refuses to create a database client or sign sessions without configuration", () => {
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.STAFF_SESSION_SECRET;
  expect(() => sessionSecret()).toThrow(HttpError);
  expect(() => database()).toThrow(
    "Staff service is not configured. Ask the booth lead to finish setup.",
  );
  expect(SESSION_COOKIE).toBe("bb_staff");
});
