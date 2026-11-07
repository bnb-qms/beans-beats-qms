import { parseQueueOrders, validStatusUpdate } from "@/lib/queue";
import {
  body,
  checkOrigin,
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

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const staff = await requireStaff();
    const input = await body(request);
    if (!validStatusUpdate(input))
      throw new HttpError(400, "Check the order and status before updating.");
    const { data, error } = await database().rpc("queue_update_status", {
      p_staff_id: staff.id,
      p_order_id: input.orderId,
      p_expected_version: input.expectedVersion,
      p_status: input.status,
    });
    if (error) {
      if (error.message === "BB_FORBIDDEN")
        throw new HttpError(403, "Staff access was revoked. Sign in again.");
      if (error.message === "BB_CONFLICT")
        throw new HttpError(
          409,
          "This order was updated by another barista. Review the latest status before trying again.",
        );
      if (error.message === "BB_INVALID_TRANSITION")
        throw new HttpError(
          409,
          "This status transition is not allowed. Refresh the queue and check the current status.",
        );
      if (error.message === "BB_NOT_FOUND")
        throw new HttpError(
          404,
          "Order not found. Refresh the queue and try again.",
        );
      if (error.message === "BB_INVALID")
        throw new HttpError(400, "Check the order and status before updating.");
      throw new HttpError(
        503,
        "Status update could not be confirmed. Review the order and retry.",
      );
    }
    return json(data);
  } catch (error) {
    return failure(error);
  }
}
