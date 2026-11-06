import {
  body,
  checkOrigin,
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";
import { parsePrice, validMenuChange, canChangeMenu } from "@/lib/menu-change";

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

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const staff = await requireStaff();
    const change = await body(request);
    if (!validMenuChange(change))
      throw new HttpError(
        400,
        "Check the selected item and value, then retry.",
      );
    if (!canChangeMenu(staff.role, change.action))
      throw new HttpError(
        403,
        "You do not have permission to make this change.",
      );
    const { data, error } = await database().rpc("counter_edit_menu", {
      p_staff_id: staff.id,
      p_kind: change.kind,
      p_id: change.id,
      p_version: change.version,
      p_change:
        change.action === "price"
          ? { price_cents: parsePrice(change.value) }
          : { is_available: change.value },
    });
    if (error) {
      if (error.message === "BB_CONFLICT")
        throw new HttpError(
          409,
          "This item changed since you started editing. Review the current saved value, then retry your change.",
        );
      if (error.message === "BB_INACTIVE")
        throw new HttpError(
          409,
          "This drink is inactive. Availability controls cannot reactivate it.",
        );
      if (error.message === "BB_FORBIDDEN")
        throw new HttpError(
          403,
          "You do not have permission to make this change.",
        );
      throw new HttpError(
        503,
        "The change could not be confirmed. Your input is retained; reconnect and retry.",
      );
    }
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
