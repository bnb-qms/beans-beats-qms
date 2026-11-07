// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderEntry } from "./order-entry";

const token = "ab".repeat(32);

const menuState = vi.hoisted(() => ({
  menu: {
    drinks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "latte",
        base_price: 8,
        is_active: true,
        is_available: true,
        version: 1,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "espresso",
        base_price: 3,
        is_active: true,
        is_available: true,
        version: 1,
      },
    ],
    addOns: [
      {
        id: "00000000-0000-4000-8000-000000000003",
        name: "iced",
        price: 1,
        is_available: true,
        version: 1,
      },
      {
        id: "00000000-0000-4000-8000-000000000004",
        name: "oat milk",
        price: 1,
        is_available: true,
        version: 1,
      },
    ],
  },
}));

vi.mock("@/components/use-menu", () => ({
  useMenu: () => ({
    menu: menuState.menu,
    connected: true,
    error: "",
    refresh: () => Promise.resolve(menuState.menu),
  }),
}));

const staff = { id: "staff-1", username: "barista", role: "barista" as const };
let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(<OrderEntry staff={staff} />);
  });
  // Draft restoration happens on a zero-delay timer.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function button(label: string) {
  return (
    [...host.querySelectorAll("button")].find((b) => b.textContent === label) ??
    null
  );
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const checkboxes = () =>
  [...host.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];

// The large POS total in the summary panel.
function posTotal() {
  const el = [...host.querySelectorAll("p")].find((p) =>
    p.className.includes("text-5xl"),
  );
  return el?.textContent ?? "";
}

it("builds the spec example: two iced oat lattes plus an espresso at S$23.00", async () => {
  await render();
  expect(posTotal()).toBe("S$0.00");
  await click(button("Add latte")!);
  expect(posTotal()).toBe("S$8.00");
  await type(
    host.querySelector('input[type="number"]') as HTMLInputElement,
    "2",
  );
  expect(posTotal()).toBe("S$16.00");
  await click(checkboxes()[0]); // iced
  expect(posTotal()).toBe("S$18.00");
  await click(checkboxes()[1]); // oat milk
  expect(posTotal()).toBe("S$20.00");
  expect(button("Add espresso")!.disabled).toBe(false);
  await click(button("Add espresso")!);
  expect(posTotal()).toBe("S$23.00");
  // Espresso is a black drink: it offers no milk option.
  expect(checkboxes()).toHaveLength(4);
  await type(
    host.querySelector('input[maxlength="20"]') as HTMLInputElement,
    "Bella",
  );
  expect(button("Submit order")!.disabled).toBe(false);
});

it("confirms a paid order, shows the receipt with a private tracking link, and resets", async () => {
  const receipt = {
    id: "order-1",
    order_number: 12,
    customer_first_name: "Mei",
    event_day: "2026-11-08",
    total_amount: 9,
    items: [
      {
        menu_item_name: "latte",
        quantity: 1,
        unit_price: 8,
        order_item_add_ons: [{ add_on_name: "oat milk", unit_price: 1 }],
      },
    ],
    tracking_url: `https://booth.test/o/track#${token}`,
    tracking_qr: "data:image/png;base64,AAAA",
    tracking_warning: null,
  };
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(receipt), { status: 200 }),
  );
  await render();
  await click(button("Add latte")!);
  await click(checkboxes()[1]); // oat milk
  await type(
    host.querySelector('input[maxlength="20"]') as HTMLInputElement,
    "Mei",
  );
  await click(button("Submit order")!);
  await vi.waitFor(() => expect(host.textContent).toContain("Order received"));
  // The submitted attempt carries the displayed POS total.
  expect(fetchMock.mock.calls[0][0]).toBe("/api/counter/orders");
  const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  expect(sent.totalCents).toBe(900);
  expect(sent.draft.firstName).toBe("Mei");
  expect(host.textContent).toContain("#12");
  expect(host.textContent).toContain("Mei");
  expect(host.textContent).toContain("1 × latte");
  expect(host.textContent).toContain("oat milk");
  expect(host.textContent).toContain("S$9.00");
  // The tracking credential travels only in the link's fragment.
  const link = host.querySelector('a[href*="/o/track#"]') as HTMLAnchorElement;
  expect(link).toBeTruthy();
  const target = new URL(link!.href);
  expect(target.hash).toBe(`#${token}`);
  expect(target.search).toBe("");
  expect(host.querySelector('img[src^="data:image/png"]')).toBeTruthy();
  expect(host.textContent).not.toContain(token);
  expect(host.textContent).not.toContain("Submission not yet confirmed");
  // The next order starts from a clean draft.
  await click(button("Take next order")!);
  expect(host.textContent).toContain("Take an order");
  expect(
    (host.querySelector('input[maxlength="20"]') as HTMLInputElement).value,
  ).toBe("");
  expect(host.textContent).not.toContain("Order received");
  expect(posTotal()).toBe("S$0.00");
  expect(button("Submit order")!.disabled).toBe(true);
});

it("shows the reason when the server rejects the order and keeps the draft", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ error: "A drink or option is unavailable." }),
      { status: 409 },
    ),
  );
  await render();
  await click(button("Add latte")!);
  await type(
    host.querySelector('input[maxlength="20"]') as HTMLInputElement,
    "Mei",
  );
  await click(button("Submit order")!);
  await vi.waitFor(() =>
    expect(host.textContent).toContain("A drink or option is unavailable."),
  );
  expect(host.textContent).not.toContain("Order received");
  // The draft is retained for correction and the order can be resubmitted.
  expect(
    (host.querySelector('input[maxlength="20"]') as HTMLInputElement).value,
  ).toBe("Mei");
  expect(host.querySelectorAll('input[type="number"]').length).toBe(1);
  expect(button("Submit order")!.disabled).toBe(false);
});
