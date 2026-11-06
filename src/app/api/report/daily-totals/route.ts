import { validReportDate, type DailyTotals } from "@/lib/daily-totals";
import {
  database,
  failure,
  HttpError,
  json,
  requireStaff,
} from "@/lib/staff-server";

// The session and database both enforce admin access to historical sales.
export async function GET(request: Request) {
  try {
    const staff = await requireStaff();
    if (staff.role !== "admin")
      throw new HttpError(403, "Admin access is required.");
    const dates = new URL(request.url).searchParams.getAll("date");
    if (dates.length !== 1 || !validReportDate(dates[0]))
      throw new HttpError(400, "Choose a valid report date.");
    const { data, error } = await database().rpc("report_daily_totals", {
      p_staff_id: staff.id,
      p_date: dates[0],
    });
    if (error?.message === "BB_FORBIDDEN")
      throw new HttpError(403, "Admin access is required.");
    if (error?.message === "BB_INVALID")
      throw new HttpError(400, "Choose a valid report date.");
    if (
      error ||
      !data ||
      data.date !== dates[0] ||
      !Number.isSafeInteger(data.cups) ||
      data.cups < 0 ||
      !Number.isSafeInteger(data.sales_cents) ||
      data.sales_cents < 0
    )
      throw new HttpError(
        503,
        "Cannot load daily totals. Check your connection and retry.",
      );
    return json(data as DailyTotals);
  } catch (error) {
    return failure(error);
  }
}
