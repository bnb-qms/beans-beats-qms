import { TRACKING_TOKEN } from "@/lib/guest-order";
import { isScanOutcome, parseReadyCodes } from "@/lib/scan";
import {
  body,
  checkOrigin,
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";

const revoked = () =>
  new HttpError(403, "Staff access was revoked. Sign in again.");

/** Today's Ready orders, with hashed tracking codes, for the scanner's offline copy. */
export async function GET() {
  try {
    const staff = await requireStaff();
    const { data, error } = await database().rpc("scan_ready_orders", {
      p_staff_id: staff.id,
    });
    if (error?.message === "BB_FORBIDDEN") throw revoked();
    const orders = error ? null : parseReadyCodes(data);
    if (!orders)
      throw new HttpError(503, "Cannot load ready orders. Retrying.");
    return json({ orders });
  } catch (error) {
    return failure(error);
  }
}

/** Mark the order behind a scanned tracking code Collected. */
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const staff = await requireStaff();
    const input = await body(request);
    if (typeof input?.code !== "string" || !TRACKING_TOKEN.test(input.code))
      throw new HttpError(400, "This QR code is not a Beans&Beats order.");
    const { data, error } = await database().rpc("scan_collect", {
      p_staff_id: staff.id,
      p_tracking_token: input.code,
    });
    if (error) {
      if (error.message === "BB_FORBIDDEN") throw revoked();
      if (error.message === "BB_NOT_FOUND")
        throw new HttpError(404, "Order not found. Please see the barista.");
      if (error.message === "BB_INVALID")
        throw new HttpError(400, "This QR code is not a Beans&Beats order.");
      throw new HttpError(503, "Scan could not be confirmed. Retrying.");
    }
    if (!isScanOutcome(data))
      throw new HttpError(503, "Scan could not be confirmed. Retrying.");
    return json(data);
  } catch (error) {
    return failure(error);
  }
}
