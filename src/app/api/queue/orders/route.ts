import { parseQueueOrders } from "@/lib/queue";
import {
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";

export async function GET() {
  try {
    const staff = await requireStaff();
    const { data, error } = await database().rpc("queue_orders", {
      p_staff_id: staff.id,
    });
    if (error?.message === "BB_FORBIDDEN")
      throw new HttpError(403, "Staff access was revoked. Sign in again.");
    const orders = error ? null : parseQueueOrders(data);
    if (!orders)
      throw new HttpError(
        503,
        "Cannot load the order queue. Check your connection and retry.",
      );
    return json({ orders });
  } catch (error) {
    return failure(error);
  }
}
