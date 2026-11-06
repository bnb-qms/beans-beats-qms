import { validReportDate } from "@/lib/daily-totals";
import { formatCsvExport, validateCsvExport } from "@/lib/csv-export";
import { database, failure, HttpError, requireStaff } from "@/lib/staff-server";

// Authorize and validate the complete snapshot before sending a CSV attachment.
export async function GET(request: Request) {
  try {
    const staff = await requireStaff();
    if (staff.role !== "admin")
      throw new HttpError(403, "Admin access is required.");
    const dates = new URL(request.url).searchParams.getAll("date");
    if (dates.length !== 1 || !validReportDate(dates[0]))
      throw new HttpError(400, "Choose a valid report date.");
    const { data, error } = await database().rpc("report_csv_export", {
      p_staff_id: staff.id,
      p_date: dates[0],
    });
    if (error?.message === "BB_FORBIDDEN")
      throw new HttpError(403, "Admin access is required.");
    if (error?.message === "BB_INVALID")
      throw new HttpError(400, "Choose a valid report date.");
    if (error) throw new HttpError(503, "Cannot export sales. Try again.");
    let csv: string;
    try {
      csv = formatCsvExport(validateCsvExport(data, dates[0]));
    } catch {
      throw new HttpError(503, "Cannot export sales. Try again.");
    }
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="beans-beats-sales-${dates[0]}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
