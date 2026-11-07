"use client";

import { StaffWorkspace } from "@/components/staff-workspace";
import { BaristaQueue } from "./barista-queue";

export default function QueuePage() {
  return (
    <StaffWorkspace>{(staff) => <BaristaQueue staff={staff} />}</StaffWorkspace>
  );
}
