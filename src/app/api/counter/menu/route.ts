import {
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";

export async function GET() {
  try {
    await requireStaff();
    const db = database();
    const [drinks, addOns] = await Promise.all([
      db
        .from("menu_items")
        .select("id, name, base_price, is_active, is_available, version")
        .order("name"),
      db
        .from("add_ons")
        .select("id, name, price, is_available, version")
        .order("name"),
    ]);
    if (drinks.error || addOns.error)
      throw new HttpError(
        503,
        "Cannot refresh the menu. Check your connection and retry.",
      );
    return json({ drinks: drinks.data, addOns: addOns.data });
  } catch (e) {
    return failure(e);
  }
}
