import { describe, expect, it } from "vitest";
import {
  allowsMilk,
  cents,
  lineTotal,
  unavailable,
  validateDraft,
  type Draft,
  type Menu,
} from "./order";

const latte = "00000000-0000-4000-8000-000000000001";
const espresso = "00000000-0000-4000-8000-000000000002";
const iced = "00000000-0000-4000-8000-000000000003";
const oat = "00000000-0000-4000-8000-000000000004";
const menu: Menu = {
  drinks: [
    {
      id: latte,
      name: "latte",
      base_price: 8,
      is_active: true,
      is_available: true,
      version: 1,
    },
    {
      id: espresso,
      name: "espresso",
      base_price: 3,
      is_active: true,
      is_available: true,
      version: 1,
    },
  ],
  addOns: [
    { id: iced, name: "iced", price: 1, is_available: true, version: 1 },
    { id: oat, name: "oat milk", price: 1, is_available: true, version: 1 },
  ],
};
const draft: Draft = {
  requestId: latte,
  firstName: "Bella",
  mobile: "",
  consent: false,
  lines: [
    { id: "line", menu_item_id: latte, quantity: 2, add_on_ids: [iced, oat] },
  ],
};

describe("counter orders", () => {
  it("calculates the spec example in cents, including per-cup add-ons", () => {
    expect(lineTotal(draft.lines[0], menu)).toBe(2000);
    expect(
      lineTotal(draft.lines[0], menu) +
        lineTotal(
          {
            id: "espresso",
            menu_item_id: espresso,
            quantity: 1,
            add_on_ids: [],
          },
          menu,
        ),
    ).toBe(2300);
    expect(cents("8.10")).toBe(810);
  });
  it("rejects empty names, invalid quantities, duplicate options and missing mobile consent", () => {
    expect(validateDraft(draft)).toBe(true);
    for (const firstName of [" ", "a".repeat(21)])
      expect(validateDraft({ ...draft, firstName })).toBe(false);
    for (const quantity of [0, -1, 1.5, 101])
      expect(
        validateDraft({ ...draft, lines: [{ ...draft.lines[0], quantity }] }),
      ).toBe(false);
    expect(
      validateDraft({
        ...draft,
        lines: [{ ...draft.lines[0], add_on_ids: [oat, oat] }],
      }),
    ).toBe(false);
    expect(validateDraft({ ...draft, mobile: "91234567" })).toBe(false);
    expect(validateDraft({ ...draft, mobile: "91234567", consent: true })).toBe(
      true,
    );
    expect(validateDraft({ ...draft, mobile: "61234567", consent: true })).toBe(
      false,
    );
  });
  it("blocks inactive drinks, sold-out drinks and options without blocking alternatives", () => {
    expect(unavailable(draft.lines[0], menu)).toBeNull();
    expect(
      unavailable(draft.lines[0], {
        ...menu,
        drinks: menu.drinks.map((d) => ({ ...d, is_active: false })),
      }),
    ).toContain("no longer");
    expect(
      unavailable(draft.lines[0], {
        ...menu,
        drinks: menu.drinks.map((d) => ({ ...d, is_available: false })),
      }),
    ).toContain("sold out");
    const noOat = {
      ...menu,
      addOns: menu.addOns.map((a) => ({ ...a, is_available: a.id !== oat })),
    };
    expect(unavailable(draft.lines[0], noOat)).toContain("oat milk");
    expect(
      unavailable({ ...draft.lines[0], add_on_ids: [iced] }, noOat),
    ).toBeNull();
  });
  it("does not permit milk on black drinks", () => {
    expect(allowsMilk("flat white")).toBe(true);
    for (const name of ["espresso", "americano", "pourover"])
      expect(allowsMilk(name)).toBe(false);
    expect(
      unavailable({ ...draft.lines[0], menu_item_id: espresso }, menu),
    ).toContain("Milk");
  });
});
