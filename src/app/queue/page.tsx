"use client";

import { StaffWorkspace } from "@/components/staff-workspace";

// Queue operations remain with F4–F6.
export default function QueuePage() {
  return (
    <StaffWorkspace>
      {() => (
        <section className="py-8">
          <h1 className="headline">Barista queue</h1>
          <p className="mt-4 text-muted">
            Queue operations are not available yet.
          </p>
        </section>
      )}
    </StaffWorkspace>
  );
}
