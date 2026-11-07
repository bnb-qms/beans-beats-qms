// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Menu } from "@/lib/order";
import type { Staff } from "@/lib/staff-server";

const mocks = vi.hoisted(() => ({
  useMenu: vi.fn(),
  requestJson: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/components/use-menu", () => ({ useMenu: mocks.useMenu }));
vi.mock("@/components/staff-workspace", () => ({
  requestJson: mocks.requestJson,
  inputClass: "field",
}));
import { MenuControls } from "./menu-controls";

const drinkId = "22222222-2222-4222-8222-222222222222";
const inactiveId = "33333333-3333-4333-8333-333333333333";
const addOnId = "11111111-1111-4111-8111-111111111111";
const baseMenu: Menu = {
  drinks: [
    {
      id: drinkId,
      name: "oat latte",
      base_price: 5.5,
      is_active: true,
      is_available: true,
      version: 3,
    },
    {
      id: inactiveId,
      name: "flat white",
      base_price: 6,
      is_active: false,
      is_available: true,
      version: 1,
    },
  ],
  addOns: [
    {
      id: addOnId,
      name: "extra shot",
      price: 1.5,
      is_available: true,
      version: 1,
    },
  ],
};
const state = { menu: baseMenu, connected: true, error: "" };
const admin: Staff = { id: "staff-1", username: "lead", role: "admin" };
const barista: Staff = { id: "staff-2", username: "brew", role: "barista" };
const counter: Staff = { id: "staff-3", username: "front", role: "counter" };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.menu = baseMenu;
  state.connected = true;
  state.error = "";
  mocks.useMenu.mockImplementation(() => ({
    ...state,
    refresh: mocks.refresh,
  }));
  mocks.refresh.mockResolvedValue(state.menu);
  mocks.requestJson.mockResolvedValue({});
  HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(staff: Staff) {
  await act(async () => {
    root.render(<MenuControls staff={staff} />);
  });
}

function buttons(text: string): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent?.trim() === text,
  );
}

function button(text: string): HTMLButtonElement {
  const match = buttons(text)[0];
  if (!match) throw new Error(`No button found: ${text}`);
  return match;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const savedBody = (index: number) =>
  JSON.parse(mocks.requestJson.mock.calls[index][1].body as string);

it("shows price and activation controls only to the admin", async () => {
  await render(admin);
  expect(buttons("Edit price")).toHaveLength(3);
  expect(buttons("Deactivate drink")).toHaveLength(1);
  expect(buttons("Reactivate drink")).toHaveLength(1);
  // The admin, only, sees the inactive drink.
  expect(host.textContent).toContain("flat white");
  await act(async () => {
    root.render(<MenuControls staff={barista} />);
  });
  expect(buttons("Edit price")).toHaveLength(0);
  expect(buttons("Deactivate drink")).toHaveLength(0);
  expect(buttons("Mark sold out")).toHaveLength(1);
  expect(host.textContent).not.toContain("flat white");
  await act(async () => {
    root.render(<MenuControls staff={counter} />);
  });
  expect(host.querySelectorAll("article button")).toHaveLength(0);
  expect(host.textContent).toContain(
    "Price changes are restricted to the booth lead.",
  );
});

it("saves a valid price and notes that past orders keep their prices", async () => {
  await render(admin);
  await click(button("Edit price"));
  await vi.waitFor(() => {
    expect(host.querySelector("form input")).not.toBeNull();
  });
  const input = host.querySelector("form input") as HTMLInputElement;
  await act(async () => type(input, "9.50"));
  await click(button("Save price"));
  await vi.waitFor(() => expect(host.textContent).toContain("Price saved."));
  expect(host.textContent).toContain("past orders keep their recorded prices");
  expect(savedBody(0)).toEqual({
    kind: "drink",
    id: drinkId,
    version: 3,
    action: "price",
    value: "9.50",
    name: "oat latte",
  });
});

it("blocks invalid prices with a visible hint until the input is fixed", async () => {
  await render(admin);
  await click(button("Edit price"));
  await vi.waitFor(() => {
    expect(host.querySelector("form input")).not.toBeNull();
  });
  const input = host.querySelector("form input") as HTMLInputElement;
  await act(async () => type(input, "9.001"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "Enter zero or a positive amount with at most two decimal places.",
    ),
  );
  expect(button("Save price").disabled).toBe(true);
  await act(async () => type(input, "-5"));
  expect(button("Save price").disabled).toBe(true);
  await act(async () => type(input, "0"));
  expect(button("Save price").disabled).toBe(false);
  expect(mocks.requestJson).not.toHaveBeenCalled();
});

it("lets baristas mark drinks sold out and options unavailable", async () => {
  await render(barista);
  await click(button("Mark sold out"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Set this drink to Sold out"),
  );
  await click(button("Save availability"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Availability saved."),
  );
  expect(savedBody(0)).toEqual({
    kind: "drink",
    id: drinkId,
    version: 3,
    action: "availability",
    value: false,
    name: "oat latte",
  });
  await click(button("Mark unavailable"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Set this option to Unavailable"),
  );
  await click(button("Save availability"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Availability saved."),
  );
  expect(savedBody(1)).toEqual({
    kind: "option",
    id: addOnId,
    version: 1,
    action: "availability",
    value: false,
    name: "extra shot",
  });
});

it("deactivates a drink behind an explicit admin confirmation", async () => {
  await render(admin);
  await click(button("Deactivate drink"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Confirm deactivation"),
  );
  await click(button("Deactivate oat latte"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "Drink deactivated. It is hidden from new orders",
    ),
  );
  expect(savedBody(0)).toEqual({
    kind: "drink",
    id: drinkId,
    version: 3,
    action: "deactivate",
    value: false,
    name: "oat latte",
  });
});

it("reactivates an inactive drink with its previous details", async () => {
  await render(admin);
  await click(button("Reactivate drink"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Confirm reactivation"),
  );
  await click(button("Reactivate flat white"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "Drink reactivated. Its previous availability setting is unchanged.",
    ),
  );
  expect(savedBody(0)).toEqual({
    kind: "drink",
    id: inactiveId,
    version: 1,
    action: "reactivate",
    value: true,
    name: "flat white",
  });
});

it("flags a stale version, retains the input and revalidates on review", async () => {
  await render(admin);
  await click(button("Edit price"));
  await vi.waitFor(() => {
    expect(host.querySelector("form input")).not.toBeNull();
  });
  const input = host.querySelector("form input") as HTMLInputElement;
  await act(async () => {
    state.menu = {
      ...state.menu,
      drinks: [{ ...state.menu.drinks[0], version: 4 }, state.menu.drinks[1]],
    };
    type(input, "9.50");
  });
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "This item changed. Your entered value is retained.",
    ),
  );
  expect(host.textContent).toContain("Current saved price: S$5.50");
  expect(button("Save price").disabled).toBe(true);
  await click(button("Review current version"));
  await vi.waitFor(() =>
    expect(host.textContent).not.toContain("This item changed"),
  );
  await click(button("Save price"));
  await vi.waitFor(() => expect(host.textContent).toContain("Price saved."));
  expect(savedBody(0)).toMatchObject({ version: 4, value: "9.50" });
});

it("retains the entered price when the save is not confirmed", async () => {
  await render(admin);
  await click(button("Edit price"));
  await vi.waitFor(() => {
    expect(host.querySelector("form input")).not.toBeNull();
  });
  const input = host.querySelector("form input") as HTMLInputElement;
  await act(async () => type(input, "9.50"));
  mocks.requestJson.mockRejectedValueOnce(
    new Error(
      "The change could not be confirmed. Your input is retained; reconnect and retry.",
    ),
  );
  await click(button("Save price"));
  await vi.waitFor(() =>
    expect(host.textContent).toContain("The change could not be confirmed."),
  );
  expect((host.querySelector("form input") as HTMLInputElement).value).toBe(
    "9.50",
  );
});

it("pauses every change while offline", async () => {
  state.connected = false;
  await render(admin);
  await vi.waitFor(() =>
    expect(host.querySelector('[role="status"]')!.textContent).toContain(
      "Offline · changes paused",
    ),
  );
  expect(button("Edit price").disabled).toBe(true);
  expect(button("Deactivate drink").disabled).toBe(true);
  await act(async () => {
    root.render(<MenuControls staff={barista} />);
  });
  expect(button("Mark sold out").disabled).toBe(true);
});
