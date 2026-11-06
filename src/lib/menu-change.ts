import { UUID } from "./order";

export type MenuChange = {
  kind: "drink" | "option";
  id: string;
  version: number;
  action: "price";
  value: string;
};
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
    change.action === "price" &&
    parsePrice(change.value) !== null
  );
}
