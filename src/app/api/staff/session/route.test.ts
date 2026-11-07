import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => mocks }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { GET, POST, DELETE } from "./route";
import { requireStaff } from "@/lib/staff-server";
import { signSession, readSession } from "@/lib/session-token";

const secret = "test-secret-with-at-least-32-characters";
const staff = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "test",
  role: "barista",
};
const request = (
  input: unknown = { username: "test", password: "test-password" },
  origin = "https://booth.test",
) =>
  new Request("https://booth.test/api/staff/session", {
    method: "POST",
    headers: { origin, host: "booth.test", "content-type": "application/json" },
    body: JSON.stringify(input),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STAFF_SESSION_SECRET", secret);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: staff, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "counter_login_attempt" ? true : [staff],
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());

it.each(["barista", "admin", "counter"])(
  "signs in %s using only trusted identity and a secure 12-hour cookie",
  async (role) => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.rpc
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data: [{ ...staff, role }] });
    const response = await POST(
      request({
        username: " test ",
        password: "test-password",
        role: "admin",
        staffId: "forged",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ staff: { ...staff, role } });
    expect(mocks.rpc).toHaveBeenLastCalledWith("verify_staff_credentials", {
      p_username: "test",
      p_password: "test-password",
    });
    const [name, token, options] = mocks.set.mock.calls[0];
    expect(name).toBe("bb_staff");
    expect(readSession(token, secret)).toBe(staff.id);
    expect(options).toEqual({
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      maxAge: 43200,
      path: "/",
    });
  },
);

it("rejects missing, wrong, disabled or unrecognised credentials generically", async () => {
  for (const data of [[], [{ ...staff, role: "guest" }]]) {
    mocks.rpc
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Username or password not recognised.",
    });
  }
  expect(mocks.set).not.toHaveBeenCalled();
});

it("validates credentials and origins before accessing the database", async () => {
  for (const input of [
    null,
    {},
    { username: "test", password: "" },
    { username: "x".repeat(101), password: "test" },
  ])
    expect((await POST(request(input))).status).toBe(400);
  expect((await POST(request(undefined, "https://other.test"))).status).toBe(
    403,
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});

it("rate limits logins and never issues a session on a service or connection failure", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false });
  expect((await POST(request())).status).toBe(429);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  mocks.rpc.mockResolvedValueOnce({
    error: { message: "private database detail" },
  });
  expect((await POST(request())).status).toBe(503);
  mocks.rpc.mockRejectedValueOnce(new TypeError("connection failed"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("connection failed");
  expect(mocks.set).not.toHaveBeenCalled();
});

it("rejects missing, forged and expired cookies before reading staff", async () => {
  for (const value of [
    undefined,
    "forged",
    signSession(staff.id, secret, Date.now() - 43200001),
  ]) {
    mocks.get.mockReturnValue({ value });
    expect(await (await GET()).json()).toEqual({ staff: null });
    await expect(requireStaff()).rejects.toMatchObject({ status: 401 });
  }
  expect(mocks.from).not.toHaveBeenCalled();
});

it("rechecks active staff and the stored role on every request", async () => {
  mocks.get.mockReturnValue({ value: signSession(staff.id, secret) });
  expect(await requireStaff()).toEqual(staff);
  expect(mocks.eq).toHaveBeenCalledWith("id", staff.id);
  expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
  for (const data of [null, { ...staff, role: "unknown" }]) {
    mocks.maybeSingle.mockResolvedValueOnce({ data });
    await expect(requireStaff()).rejects.toMatchObject({ status: 401 });
  }
  mocks.maybeSingle.mockResolvedValueOnce({
    data: { ...staff, role: "admin" },
  });
  expect((await requireStaff()).role).toBe("admin");
  mocks.maybeSingle.mockResolvedValueOnce({
    error: { message: "private detail" },
  });
  expect((await GET()).status).toBe(503);
});

it("clears the cookie on same-origin sign-out without deleting pending work", async () => {
  expect((await DELETE(request(undefined, "https://other.test"))).status).toBe(
    403,
  );
  expect(mocks.delete).not.toHaveBeenCalled();
  expect((await DELETE(request())).status).toBe(200);
  expect(mocks.delete).toHaveBeenCalledWith("bb_staff");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("issues a non-secure cookie outside production", async () => {
  vi.stubEnv("NODE_ENV", "development");
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: [staff] });
  expect((await POST(request())).status).toBe(200);
  const [name, token, options] = mocks.set.mock.calls[0];
  expect(name).toBe("bb_staff");
  expect(readSession(token, secret)).toBe(staff.id);
  expect(options).toEqual({
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    maxAge: 43200,
    path: "/",
  });
});

it("returns a null session when the stored role is revoked or unknown", async () => {
  mocks.get.mockReturnValue({ value: signSession(staff.id, secret) });
  for (const data of [{ ...staff, role: "former-barista" }, null]) {
    mocks.maybeSingle.mockResolvedValueOnce({ data, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ staff: null });
  }
});

it("rejects oversized passwords before touching the database", async () => {
  const response = await POST(
    request({ username: "test", password: "x".repeat(201) }),
  );
  expect(response.status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});
