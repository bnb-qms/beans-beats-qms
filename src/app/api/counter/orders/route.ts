import {
  body,
  checkOrigin,
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";
import { validateDraft, type Draft } from "@/lib/order";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const staff = await requireStaff();
    const input = await body(request);
    if (
      !validateDraft(input?.draft) ||
      !Number.isSafeInteger(input.totalCents) ||
      input.totalCents < 0 ||
      input.totalCents > 99999999
    )
      throw new HttpError(
        400,
        "Check the name, quantities, options and any mobile consent before submitting.",
      );
    const d = input.draft as Draft;
    const { data, error } = await database().rpc("counter_submit_order", {
      p_staff_id: staff.id,
      p_request_id: d.requestId,
      p_first_name: d.firstName.trim(),
      p_mobile: d.mobile || null,
      p_consent: d.consent,
      p_items: d.lines.map((l) => ({
        menu_item_id: l.menu_item_id,
        quantity: l.quantity,
        add_on_ids: l.add_on_ids,
      })),
      p_total_cents: input.totalCents,
    });
    if (error) {
      const messages: Record<string, string> = {
        BB_UNAVAILABLE:
          "A drink or option is unavailable. Your draft is retained. If payment was taken, reconcile it on the POS before changing the order.",
        BB_PRICE_CHANGED:
          "Prices changed before submission. Your draft is retained. Reconcile any POS payment with the updated total before submitting again.",
        BB_INVALID:
          "Check the name, quantities and options. Your draft is retained.",
        BB_FORBIDDEN: "Staff access was revoked. Sign in again.",
      };
      const message = messages[error.message];
      throw new HttpError(
        error.message === "BB_FORBIDDEN" ? 403 : message ? 409 : 503,
        message ??
          "Order could not be confirmed. Retry this same draft to avoid duplicates.",
      );
    }
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
