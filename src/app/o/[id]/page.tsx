import { Suspense } from "react";
import type { Metadata } from "next";
import { GuestStatus } from "./guest-status";

export const metadata: Metadata = {
  title: "Your order | Beans&Beats",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

async function Order({ params }: PageProps<"/o/[id]">) {
  const { id } = await params;
  return <GuestStatus key={id} id={id} />;
}

export default function GuestStatusPage(props: PageProps<"/o/[id]">) {
  return (
    <Suspense
      fallback={
        <main className="p-8" role="status">
          Loading order…
        </main>
      }
    >
      <Order {...props} />
    </Suspense>
  );
}
