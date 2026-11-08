import { UUID } from "@/lib/order";
import {
  body,
  checkOrigin,
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";

/** #42: cancel an uncollected order. Needs a connection; the POS refund is done on the POS. */
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const staff = await requireStaff();
    const input = await body(request);
    if (
      typeof input?.orderId !== "string" ||
      !UUID.test(input.orderId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    )
      throw new HttpError(400, "Check the order before cancelling.");
    const { data, error } = await database().rpc("queue_cancel_order", {
      p_staff_id: staff.id,
      p_order_id: input.orderId,
      p_expected_version: input.expectedVersion,
    });
    if (error) {
      if (error.message === "BB_FORBIDDEN")
        throw new HttpError(403, "Staff access was revoked. Sign in again.");
      if (error.message === "BB_CONFLICT")
        throw new HttpError(
          409,
          "This order was updated by another barista. Review it before cancelling.",
        );
      if (error.message === "BB_INVALID_TRANSITION")
        throw new HttpError(
          409,
          "This order was already collected and cannot be cancelled.",
        );
      if (error.message === "BB_NOT_FOUND")
        throw new HttpError(404, "Order not found. Refresh the queue.");
      if (error.message === "BB_INVALID")
        throw new HttpError(400, "Check the order before cancelling.");
      throw new HttpError(
        503,
        "Cancellation could not be confirmed. Check your connection and retry.",
      );
    }
    return json(data);
  } catch (error) {
    return failure(error);
  }
}
