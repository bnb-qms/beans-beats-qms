"use client";

import { StaffWorkspace } from "@/components/staff-workspace";
import { DailyTotalsReport } from "./daily-totals";

export default function ReportPage() {
  return (
    <StaffWorkspace>
      {(staff) =>
        staff.role === "admin" ? (
          <DailyTotalsReport />
        ) : (
          <p className="mt-8" role="alert">
            Admin access is required.
          </p>
        )
      }
    </StaffWorkspace>
  );
}
