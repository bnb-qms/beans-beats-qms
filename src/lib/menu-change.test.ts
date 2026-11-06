import { expect, it } from "vitest";
import { parsePrice, validMenuChange, canChangeMenu } from "./menu-change";

it("parses SGD amounts without rounding extra decimals or accepting exponent syntax", () => {
  expect(parsePrice("8")).toBe(800);
  expect(parsePrice(" 8.10 ")).toBe(810);
  expect(parsePrice("0.01")).toBe(1);
  expect(parsePrice("0")).toBe(0);
  for (const value of [
    "",
    " ",
    "-1",
    "8.001",
    "1e3",
    "1,000",
    "Infinity",
    "1000000",
    null,
    8,
  ])
    expect(parsePrice(value)).toBeNull();
});

it("permits baristas to set explicit availability without admin privileges", () => {
  const change = {
    kind: "option",
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
    action: "availability",
    value: false,
  };
  expect(validMenuChange(change)).toBe(true);
  expect(validMenuChange({ ...change, value: "false" })).toBe(false);
  expect(canChangeMenu("barista", "availability")).toBe(true);
  expect(canChangeMenu("barista", "price")).toBe(false);
  expect(canChangeMenu("counter", "availability")).toBe(false);
});

it("only permits admins to deactivate whole drinks, never reactivate or delete options", () => {
  const change = {
    kind: "drink",
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
    action: "deactivate",
    value: false,
  };
  expect(validMenuChange(change)).toBe(true);
  expect(validMenuChange({ ...change, value: true })).toBe(false);
  expect(validMenuChange({ ...change, kind: "option" })).toBe(false);
  expect(canChangeMenu("admin", "deactivate")).toBe(true);
  expect(canChangeMenu("barista", "deactivate")).toBe(false);
});
it("requires an exact item and version for admin price changes", () => {
  const change = {
    kind: "drink",
    id: "00000000-0000-4000-8000-000000000001",
    version: 2,
    action: "price",
    value: "9.00",
  };
  expect(validMenuChange(change)).toBe(true);
  for (const patch of [
    { kind: "staff" },
    { id: "bad" },
    { version: 0 },
    { version: "2" },
    { action: "delete" },
    { value: "-1" },
  ])
    expect(validMenuChange({ ...change, ...patch })).toBe(false);
});
