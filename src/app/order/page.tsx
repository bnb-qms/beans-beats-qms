"use client";

import { StaffWorkspace } from "@/components/staff-workspace";
import { OrderEntry } from "./order-entry";

export default function OrderPage() {
  return (
    <StaffWorkspace>{(staff) => <OrderEntry staff={staff} />}</StaffWorkspace>
  );
}
