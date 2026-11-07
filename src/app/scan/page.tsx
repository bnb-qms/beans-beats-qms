"use client";

import { StaffWorkspace } from "@/components/staff-workspace";
import { Scanner } from "./scanner";

export default function ScanPage() {
  return (
    <StaffWorkspace>{(staff) => <Scanner staff={staff} />}</StaffWorkspace>
  );
}
