import { UUID } from "./order";

export type MenuChange = {
  kind: "drink" | "option";
  id: string;
  version: number;
} & (
  | { action: "price"; value: string }
  | { action: "availability"; value: boolean }
  | { action: "deactivate"; value: false }
);
export type DeactivationChange = Extract<MenuChange, { action: "deactivate" }>;
export type PriceChange = Extract<MenuChange, { action: "price" }>;
export type AvailabilityChange = Extract<
  MenuChange,
  { action: "availability" }
>;
export function parsePrice(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,6}(\.\d{1,2})?$/.test(value.trim()))
    return null;
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function validMenuChange(input: unknown): input is MenuChange {
  if (!input || typeof input !== "object") return false;
  const change = input as MenuChange;
  return (
    ["drink", "option"].includes(change.kind) &&
    UUID.test(change.id) &&
    Number.isSafeInteger(change.version) &&
    change.version > 0 &&
    ((change.action === "price" && parsePrice(change.value) !== null) ||
      (change.action === "availability" && typeof change.value === "boolean") ||
      (change.action === "deactivate" &&
        change.kind === "drink" &&
        change.value === false))
  );
}

export function canChangeMenu(
  role: string,
  action: MenuChange["action"],
): boolean {
  return role === "admin" || (role === "barista" && action === "availability");
}
