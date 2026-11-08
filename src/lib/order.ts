export type Drink = {
  id: string;
  name: string;
  base_price: number;
  is_active: boolean;
  is_available: boolean;
  version: number;
};
export type AddOn = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  version: number;
};
export type Menu = { drinks: Drink[]; addOns: AddOn[] };
export type Line = {
  id: string;
  menu_item_id: string;
  quantity: number;
  add_on_ids: string[];
};
export type Draft = {
  requestId: string;
  firstName: string;
  mobile: string;
  consent: boolean;
  lines: Line[];
};
export type Receipt = {
  id: string;
  tracking_url: string | null;
  tracking_qr: string | null;
  tracking_warning: string | null;
  order_number: number;
  event_day: string;
  customer_first_name: string;
  total_amount: number;
  items: {
    menu_item_name: string;
    quantity: number;
    unit_price: number;
    order_item_add_ons: { add_on_name: string; unit_price: number }[];
  }[];
};

export function cents(value: number | string): number {
  return Math.round(Number(value) * 100);
}
export function allowsMilk(name: string): boolean {
  return ["latte", "flat white"].includes(name.toLowerCase());
}
export function lineTotal(line: Line, menu: Menu): number {
  const drink = menu.drinks.find((d) => d.id === line.menu_item_id);
  return (
    line.quantity *
    (cents(drink?.base_price ?? 0) +
      line.add_on_ids.reduce(
        (sum, id) =>
          sum + cents(menu.addOns.find((a) => a.id === id)?.price ?? 0),
        0,
      ))
  );
}
export function unavailable(line: Line, menu: Menu): string | null {
  const drink = menu.drinks.find((d) => d.id === line.menu_item_id);
  if (!drink?.is_active)
    return "This drink is no longer on the menu. Remove or replace it.";
  if (!drink.is_available)
    return `${drink.name} is sold out. Remove or replace it.`;
  for (const id of line.add_on_ids) {
    const option = menu.addOns.find((a) => a.id === id);
    if (!option?.is_available)
      return `${option?.name ?? "An option"} is unavailable. Change this selection.`;
    if (option.name === "oat milk" && !allowsMilk(drink.name))
      return "Milk is not offered for this drink.";
  }
  return null;
}
export function validateDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const d = value as Draft;
  return (
    typeof d.requestId === "string" &&
    UUID.test(d.requestId) &&
    typeof d.firstName === "string" &&
    d.firstName.trim().length <= 20 &&
    typeof d.mobile === "string" &&
    (!d.mobile || /^[89]\d{7}$/.test(d.mobile)) &&
    typeof d.consent === "boolean" &&
    (!d.mobile || d.consent) &&
    Array.isArray(d.lines) &&
    d.lines.length > 0 &&
    d.lines.length <= 100 &&
    d.lines.every(
      (l) =>
        l &&
        UUID.test(l.menu_item_id) &&
        Number.isInteger(l.quantity) &&
        l.quantity > 0 &&
        l.quantity <= 100 &&
        Array.isArray(l.add_on_ids) &&
        l.add_on_ids.length <= 2 &&
        l.add_on_ids.every((id) => typeof id === "string" && UUID.test(id)) &&
        new Set(l.add_on_ids).size === l.add_on_ids.length,
    )
  );
}
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
