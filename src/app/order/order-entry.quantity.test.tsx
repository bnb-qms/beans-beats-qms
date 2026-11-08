// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderEntry } from "./order-entry";

vi.mock("@/components/use-menu", () => ({
  useMenu: () => ({
    menu: {
      drinks: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "espresso",
          base_price: 3,
          is_active: true,
          is_available: true,
          version: 1,
        },
      ],
      addOns: [],
    },
    connected: true,
    error: "",
    refresh: vi.fn(),
  }),
}));

const staff = { id: "staff-1", username: "barista", role: "barista" as const };
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

const posTotal = () =>
  [...host.querySelectorAll("p")].find(
    (p) => p.textContent === "Enter into the separate POS",
  )?.nextElementSibling?.textContent;

function setQuantity(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it.each(["-1", "2.5", "1000"])(
  "shows no total while the quantity is %s",
  async (quantity) => {
    await act(async () => root.render(<OrderEntry staff={staff} />));
    await vi.waitFor(() => expect(host.textContent).toContain("Add espresso"));
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Add espresso")!
        .click(),
    );
    await act(async () => setQuantity(quantity));
    expect(host.textContent).toContain("Enter a whole-number quantity");
    expect(posTotal()).toBe("—");
    await act(async () => setQuantity("2"));
    expect(posTotal()).toBe("S$6.00");
  },
);
