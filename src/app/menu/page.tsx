"use client";

import { StaffWorkspace } from "@/components/staff-workspace";
import { MenuControls } from "./menu-controls";

export default function MenuPage() {
  return (
    <StaffWorkspace>{(staff) => <MenuControls staff={staff} />}</StaffWorkspace>
  );
}
